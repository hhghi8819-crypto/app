"""Backend API tests for Pharmacy Management App"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Fallback: read frontend/.env
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
    except Exception:
        pass

API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def created_ids():
    return []


# -------------------- Items --------------------
class TestItems:
    def test_list_seeded_items(self, client):
        r = client.get(f"{API}/items", timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) >= 12, f"Expected >=12 seeded items, got {len(data)}"
        # Validate required fields
        required = {"id", "name", "buying_price", "selling_price", "supplier", "type", "stock_qty"}
        for item in data[:3]:
            assert required.issubset(item.keys()), f"Missing fields: {required - set(item.keys())}"
        # Verify Omeprazole has stock 5 (for low-stock badge testing)
        ome = [i for i in data if "Omeprazole" in i["name"]]
        assert ome and ome[0]["stock_qty"] == 5

    def test_search_filter(self, client):
        r = client.get(f"{API}/items", params={"search": "para"}, timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert len(data) >= 1
        assert any("Paracetamol" in i["name"] for i in data)

    def test_get_by_barcode_found(self, client):
        r = client.get(f"{API}/items/by-barcode/6291100100015", timeout=20)
        assert r.status_code == 200
        assert r.json()["name"] == "Paracetamol 500mg"

    def test_get_by_barcode_404(self, client):
        r = client.get(f"{API}/items/by-barcode/NOPE_999999", timeout=20)
        assert r.status_code == 404

    def test_create_item_with_barcode(self, client, created_ids):
        payload = {
            "name": f"TEST_Item_{uuid.uuid4().hex[:6]}",
            "barcode": f"TESTBC_{uuid.uuid4().hex[:8]}",
            "buying_price": 1000,
            "selling_price": 1500,
            "supplier": "TEST_Supplier",
            "type": "Tablet",
            "stock_qty": 20,
        }
        r = client.post(f"{API}/items", json=payload, timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["name"] == payload["name"]
        assert body["barcode"] == payload["barcode"]
        assert "id" in body
        created_ids.append(body["id"])
        # Verify persistence
        rg = client.get(f"{API}/items/{body['id']}", timeout=20)
        assert rg.status_code == 200
        assert rg.json()["selling_price"] == 1500

    def test_create_item_without_barcode(self, client, created_ids):
        payload = {
            "name": f"TEST_NoBC_{uuid.uuid4().hex[:6]}",
            "buying_price": 200,
            "selling_price": 500,
            "supplier": "TEST_Supplier",
            "type": "Misc",
            "stock_qty": 5,
        }
        r = client.post(f"{API}/items", json=payload, timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("barcode") in (None, "")
        created_ids.append(body["id"])

    def test_create_duplicate_barcode(self, client):
        bc = f"DUPBC_{uuid.uuid4().hex[:8]}"
        p = {"name": "TEST_A", "barcode": bc, "buying_price": 1, "selling_price": 2, "supplier": "S", "type": "T", "stock_qty": 1}
        r1 = client.post(f"{API}/items", json=p, timeout=20)
        assert r1.status_code == 200
        p2 = {**p, "name": "TEST_B"}
        r2 = client.post(f"{API}/items", json=p2, timeout=20)
        assert r2.status_code == 400

    def test_update_item(self, client, created_ids):
        assert created_ids
        iid = created_ids[0]
        r = client.put(f"{API}/items/{iid}", json={"stock_qty": 99, "selling_price": 1999}, timeout=20)
        assert r.status_code == 200
        body = r.json()
        assert body["stock_qty"] == 99
        assert body["selling_price"] == 1999
        # Verify persisted
        rg = client.get(f"{API}/items/{iid}", timeout=20)
        assert rg.json()["stock_qty"] == 99

    def test_delete_item(self, client, created_ids):
        # Delete the last created
        iid = created_ids.pop()
        r = client.delete(f"{API}/items/{iid}", timeout=20)
        assert r.status_code == 200
        rg = client.get(f"{API}/items/{iid}", timeout=20)
        assert rg.status_code == 404


# -------------------- Sales / Checkout --------------------
class TestCheckout:
    def test_checkout_decrements_stock(self, client):
        # Create a test item with known stock
        payload = {
            "name": f"TEST_Checkout_{uuid.uuid4().hex[:6]}",
            "buying_price": 100,
            "selling_price": 250,
            "supplier": "TEST_Supplier",
            "type": "Tablet",
            "stock_qty": 10,
        }
        r = client.post(f"{API}/items", json=payload, timeout=20)
        assert r.status_code == 200
        item = r.json()
        iid = item["id"]

        co = client.post(f"{API}/sales/checkout", json={"items": [{"item_id": iid, "qty": 3}]}, timeout=20)
        assert co.status_code == 200, co.text
        sale = co.json()
        assert sale["total"] == 750.0
        assert len(sale["lines"]) == 1
        assert sale["lines"][0]["subtotal"] == 750.0

        # Verify stock decremented
        rg = client.get(f"{API}/items/{iid}", timeout=20)
        assert rg.json()["stock_qty"] == 7

        # Cleanup
        client.delete(f"{API}/items/{iid}", timeout=20)

    def test_checkout_insufficient_stock(self, client):
        payload = {
            "name": f"TEST_LowStock_{uuid.uuid4().hex[:6]}",
            "buying_price": 100, "selling_price": 200,
            "supplier": "S", "type": "T", "stock_qty": 2,
        }
        r = client.post(f"{API}/items", json=payload, timeout=20)
        iid = r.json()["id"]
        co = client.post(f"{API}/sales/checkout", json={"items": [{"item_id": iid, "qty": 5}]}, timeout=20)
        assert co.status_code == 400
        # Cleanup
        client.delete(f"{API}/items/{iid}", timeout=20)


# Module teardown
@pytest.fixture(scope="module", autouse=True)
def cleanup(client, created_ids):
    yield
    for iid in created_ids:
        try:
            client.delete(f"{API}/items/{iid}", timeout=10)
        except Exception:
            pass
    # Clean up any leftover TEST_ items
    try:
        r = client.get(f"{API}/items", params={"search": "TEST_"}, timeout=10)
        for it in r.json():
            client.delete(f"{API}/items/{it['id']}", timeout=10)
    except Exception:
        pass
