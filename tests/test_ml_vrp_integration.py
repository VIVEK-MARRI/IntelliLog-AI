from __future__ import annotations

import numpy as np
import pytest

from src.ml.features.traffic_client import LatLon
from src.optimization.ml_travel_matrix import MLTravelTimeMatrix
from src.optimization.route_optimizer import RouteOptimizer, vrp_matrix_type_total


def _run_async(awaitable):
    import asyncio

    return asyncio.run(awaitable)


class FakeRedis:
    def __init__(self):
        self.storage = {}
        self.set_calls = []

    def get(self, key):
        return self.storage.get(key)

    def set(self, key, value, ex=None):
        self.storage[key] = value
        self.set_calls.append((key, ex))


class MockTrafficCache:
    async def get_cached_travel_time(self, origin, destination):
        return {
            "traffic_ratio": 1.0,
            "historical_avg": 1.0,
            "historical_std": 0.1,
            "weather_severity": 0.0,
            "source": "cached",
        }


def test_matrix_shape():
    class Constant20MinModel:
        def predict(self, features):
            return np.array([20.0]), {}

    points = [
        LatLon(12.9716, 77.5946),
        LatLon(12.9352, 77.6245),
        LatLon(12.9611, 77.6387),
        LatLon(12.9141, 77.6446),
        LatLon(13.0035, 77.5704),
    ]

    builder = MLTravelTimeMatrix(
        model=Constant20MinModel(),
        feature_store=None,
        traffic_cache=MockTrafficCache(),
        redis_client=FakeRedis(),
        tenant_id="tenant_test",
    )

    matrix = _run_async(builder.build(points))

    assert matrix.shape == (5, 5)
    assert np.all(np.diag(matrix) == 0.0)
    off_diag_mask = ~np.eye(5, dtype=bool)
    assert np.all(matrix[off_diag_mask] > 0.0)


def test_matrix_values_use_ml_predictions():
    class Constant15MinModel:
        def predict(self, features):
            return np.array([15.0]), {}

    points = [LatLon(12.9716, 77.5946), LatLon(12.9611, 77.6387)]
    builder = MLTravelTimeMatrix(
        model=Constant15MinModel(),
        feature_store=None,
        traffic_cache=MockTrafficCache(),
        redis_client=FakeRedis(),
        tenant_id="tenant_test",
    )

    matrix = _run_async(builder.build(points))

    assert matrix[0][1] == 15.0 * 60
    assert matrix[1][0] == 15.0 * 60


def test_fallback_on_model_failure():
    class FailingModel:
        def predict(self, features):
            raise Exception("model error")

    points = [LatLon(0.0, 0.0), LatLon(0.0, 0.0899)]  # approx 10km at equator
    builder = MLTravelTimeMatrix(
        model=FailingModel(),
        feature_store=None,
        traffic_cache=MockTrafficCache(),
        redis_client=FakeRedis(),
        tenant_id="tenant_test",
    )

    matrix = _run_async(builder.build(points))

    assert matrix[0][1] == pytest.approx(1200.0, rel=0.1)


def test_matrix_cached_in_redis():
    class CountingModel:
        def __init__(self):
            self.calls = 0

        def predict(self, features):
            self.calls += 1
            return np.array([10.0]), {}

    fake_redis = FakeRedis()
    model = CountingModel()
    points = [LatLon(12.9716, 77.5946), LatLon(12.9611, 77.6387)]
    builder = MLTravelTimeMatrix(
        model=model,
        feature_store=None,
        traffic_cache=MockTrafficCache(),
        redis_client=fake_redis,
        tenant_id="tenant_test",
    )

    _run_async(builder.build(points))
    calls_after_first = model.calls
    _run_async(builder.build(points))

    assert fake_redis.set_calls
    assert fake_redis.set_calls[-1][1] == 900
    assert model.calls == calls_after_first


def test_or_tools_uses_ml_matrix():
    pytest.importorskip("ortools")

    optimizer = RouteOptimizer()

    drivers = [{"id": "d1", "current_lat": 0.0, "current_lng": 0.0}]
    orders = [
        {"id": "o_b", "delivery_lat": 0.0, "delivery_lng": 0.0100},
        {"id": "o_c", "delivery_lat": 0.0, "delivery_lng": 0.0300},
    ]

    static_result = _run_async(
        optimizer.solve(
            orders=orders,
            drivers=drivers,
            travel_time_matrix=None,
            tenant_id="tenant_test",
        )
    )

    ml_matrix = np.array(
        [
            [0.0, 5000.0, 10.0],
            [10.0, 0.0, 5000.0],
            [10.0, 10.0, 0.0],
        ],
        dtype=np.float64,
    )

    ml_result = _run_async(
        optimizer.solve(
            orders=orders,
            drivers=drivers,
            travel_time_matrix=ml_matrix,
            tenant_id="tenant_test",
        )
    )

    static_route = static_result["routes"][0]["route"] if static_result["routes"] else []
    ml_route = ml_result["routes"][0]["route"] if ml_result["routes"] else []

    assert static_route == ["o_b", "o_c"]
    assert ml_route == ["o_c", "o_b"]


def test_optimize_routes_celery_task(monkeypatch):
    import sys
    import types

    if "celery" not in sys.modules:
        celery_stub = types.ModuleType("celery")
        celery_schedules_stub = types.ModuleType("celery.schedules")

        class _ConfStub(dict):
            def __getattr__(self, name):
                return self.get(name)

            def __setattr__(self, name, value):
                self[name] = value

        class _CeleryStub:
            def __init__(self, *args, **kwargs):
                self.conf = _ConfStub(task_routes={})

            def task(self, *args, **kwargs):
                def _decorator(func):
                    class _TaskWrapper:
                        def __init__(self, fn):
                            self._fn = fn

                        def run(self, *f_args, **f_kwargs):
                            return self._fn(None, *f_args, **f_kwargs)

                    return _TaskWrapper(func)

                return _decorator

        celery_stub.Celery = _CeleryStub
        sys.modules["celery"] = celery_stub
        celery_schedules_stub.crontab = lambda *args, **kwargs: {"args": args, "kwargs": kwargs}
        sys.modules["celery.schedules"] = celery_schedules_stub

    from src.backend.worker import tasks as worker_tasks

    class Obj:
        def __init__(self, **kwargs):
            for k, v in kwargs.items():
                setattr(self, k, v)

    orders = [
        Obj(id="o1", tenant_id="tenant_test", lat=12.9611, lng=77.6387, status="pending", weight=1.0),
        Obj(id="o2", tenant_id="tenant_test", lat=12.9141, lng=77.6446, status="pending", weight=1.0),
    ]
    drivers = [
        Obj(id="d1", tenant_id="tenant_test", current_lat=12.9716, current_lng=77.5946, status="active"),
        Obj(id="d2", tenant_id="tenant_test", current_lat=12.9352, current_lng=77.6245, status="active"),
    ]

    class FakeQuery:
        def __init__(self, model, session):
            self.model = model
            self.session = session

        def filter(self, *args, **kwargs):
            return self

        def all(self):
            if self.model.__name__ == "Order":
                return self.session.orders
            if self.model.__name__ == "Driver":
                return self.session.drivers
            return []

        def first(self):
            if self.model.__name__ == "Order":
                return self.session.orders[0] if self.session.orders else None
            return None

    class FakeSession:
        def __init__(self, orders_data, drivers_data):
            self.orders = orders_data
            self.drivers = drivers_data
            self._route_seq = 0

        def query(self, model):
            return FakeQuery(model, self)

        def add(self, obj):
            return None

        def flush(self):
            self._route_seq += 1

        def commit(self):
            return None

        def close(self):
            return None

    class FakeBuilder:
        def __init__(self, **kwargs):
            pass

        async def build(self, points):
            return np.full((4, 4), 900.0, dtype=np.float64)

    class FakeOptimizer:
        async def solve(self, orders, drivers, travel_time_matrix=None, tenant_id="default", time_limit_sec=10):
            vrp_matrix_type_total.labels(matrix_source="ml_predicted", tenant_id=tenant_id).inc()
            return {
                "matrix_source": "ml_predicted",
                "routes": [{"driver_id": "d1", "route": ["o1", "o2"]}],
                "unassigned": [],
            }

    fake_session = FakeSession(orders, drivers)

    monkeypatch.setattr(worker_tasks, "_HAS_MLFLOW", False)
    monkeypatch.setattr(worker_tasks, "_get_db_session", lambda: fake_session)
    monkeypatch.setattr(worker_tasks, "_load_production_model_from_mlflow", lambda: object())
    monkeypatch.setattr(worker_tasks, "TrafficCache", lambda db_session=None: MockTrafficCache())
    monkeypatch.setattr(worker_tasks, "MLTravelTimeMatrix", FakeBuilder)
    monkeypatch.setattr(worker_tasks, "RouteOptimizer", lambda: FakeOptimizer())
    monkeypatch.setattr(worker_tasks.redis_lib, "from_url", lambda *args, **kwargs: FakeRedis())

    before = vrp_matrix_type_total.labels(matrix_source="ml_predicted", tenant_id="tenant_test")._value.get()
    result = worker_tasks.optimize_routes.run(
        tenant_id="tenant_test",
        order_ids=[o.id for o in orders],
        driver_ids=[d.id for d in drivers],
    )
    after = vrp_matrix_type_total.labels(matrix_source="ml_predicted", tenant_id="tenant_test")._value.get()

    assert result["status"] == "success"
    assert result["matrix_source"] == "ml_predicted"
    assert after > before
