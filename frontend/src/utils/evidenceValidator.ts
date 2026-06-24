import type { LiveOrder } from '@/types/api'
import type { ValidatedEvidence, EntityReference } from '@/types/copilot'

const ENTITY_RE = /(ORD-[A-Z0-9-]+|DRV-[A-Z0-9-]+)/g

function validateEntities(text: string, orders: Map<string, LiveOrder>): EntityReference[] {
  const matches = text.match(ENTITY_RE)
  if (!matches) return []
  const seen = new Set<string>()
  const entities: EntityReference[] = []
  for (const id of matches) {
    if (seen.has(id)) continue
    seen.add(id)
    const type = id.startsWith('ORD-') ? 'order' : 'driver'
    let exists = false
    if (type === 'order') {
      exists = orders.has(id)
    } else {
      for (const o of orders.values()) {
        if (o.driver_id === id) { exists = true; break }
      }
    }
    entities.push({ id, type, exists })
  }
  return entities
}

function computeStatus(entities: EntityReference[]): 'validated' | 'unverified' | 'mixed' {
  if (entities.length === 0) return 'unverified'
  if (entities.every((e) => e.exists)) return 'validated'
  if (entities.some((e) => e.exists)) return 'mixed'
  return 'unverified'
}

export function validateEvidence(
  evidence: string[],
  orders: Map<string, LiveOrder>
): ValidatedEvidence[] {
  return evidence.map((text) => {
    const entities = validateEntities(text, orders)
    const status = computeStatus(entities)
    return { text, entities, status }
  })
}
