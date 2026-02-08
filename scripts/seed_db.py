"""
Database seeding script for IntelliLog-AI
Populates the database with sample tenants, users, drivers, and orders
"""
import sys
import os

# Add project root to Python path
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, project_root)

if __name__ == "__main__":
    print("=" * 60)
    print("IntelliLog-AI Database Seeding")
    print("=" * 60)
    print()
    
    try:
        from src.backend.app.db.seed import seed_data
        seed_data()
        print()
        print("=" * 60)
        print("✅ Database seeding completed successfully!")
        print("=" * 60)
    except Exception as e:
        print()
        print("=" * 60)
        print(f"❌ Error during seeding: {str(e)}")
        print("=" * 60)
        import traceback
        traceback.print_exc()
        sys.exit(1)
