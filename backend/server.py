from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
import uuid
from datetime import datetime, timezone


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")


# -------------------- Models --------------------
class ItemBase(BaseModel):
    name: str
    barcode: Optional[str] = None
    buying_price: float
    selling_price: float
    supplier: str
    type: str
    stock_qty: int = 0


class ItemCreate(ItemBase):
    pass


class ItemUpdate(BaseModel):
    name: Optional[str] = None
    barcode: Optional[str] = None
    buying_price: Optional[float] = None
    selling_price: Optional[float] = None
    supplier: Optional[str] = None
    type: Optional[str] = None
    stock_qty: Optional[int] = None


class Item(ItemBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class SaleLine(BaseModel):
    item_id: str
    name: str
    qty: int
    unit_price: float
    subtotal: float


class CheckoutItem(BaseModel):
    item_id: str
    qty: int


class CheckoutRequest(BaseModel):
    items: List[CheckoutItem]


class Sale(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    lines: List[SaleLine]
    total: float
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# -------------------- Helpers --------------------
def _clean(doc: dict) -> dict:
    doc.pop("_id", None)
    if isinstance(doc.get("created_at"), str):
        try:
            doc["created_at"] = datetime.fromisoformat(doc["created_at"])
        except Exception:
            pass
    return doc


# -------------------- Routes --------------------
@api_router.get("/")
async def root():
    return {"message": "Pharmacy API running"}


# Items
@api_router.get("/items", response_model=List[Item])
async def list_items(search: Optional[str] = None):
    query: dict = {}
    if search:
        query = {
            "$or": [
                {"name": {"$regex": search, "$options": "i"}},
                {"barcode": {"$regex": search, "$options": "i"}},
                {"supplier": {"$regex": search, "$options": "i"}},
                {"type": {"$regex": search, "$options": "i"}},
            ]
        }
    docs = await db.items.find(query, {"_id": 0}).sort("name", 1).to_list(1000)
    return [_clean(d) for d in docs]


@api_router.get("/items/by-barcode/{barcode}", response_model=Item)
async def get_item_by_barcode(barcode: str):
    doc = await db.items.find_one({"barcode": barcode}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Item not found")
    return _clean(doc)


@api_router.get("/items/{item_id}", response_model=Item)
async def get_item(item_id: str):
    doc = await db.items.find_one({"id": item_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Item not found")
    return _clean(doc)


@api_router.post("/items", response_model=Item)
async def create_item(payload: ItemCreate):
    # If barcode provided, ensure uniqueness
    if payload.barcode:
        existing = await db.items.find_one({"barcode": payload.barcode}, {"_id": 0})
        if existing:
            raise HTTPException(status_code=400, detail="An item with this barcode already exists")
    item = Item(**payload.model_dump())
    doc = item.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.items.insert_one(doc)
    return item


@api_router.put("/items/{item_id}", response_model=Item)
async def update_item(item_id: str, payload: ItemUpdate):
    existing = await db.items.find_one({"id": item_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Item not found")
    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    if "barcode" in updates and updates["barcode"]:
        conflict = await db.items.find_one(
            {"barcode": updates["barcode"], "id": {"$ne": item_id}}, {"_id": 0}
        )
        if conflict:
            raise HTTPException(status_code=400, detail="Another item already uses this barcode")
    if updates:
        await db.items.update_one({"id": item_id}, {"$set": updates})
    doc = await db.items.find_one({"id": item_id}, {"_id": 0})
    return _clean(doc)


@api_router.delete("/items/{item_id}")
async def delete_item(item_id: str):
    res = await db.items.delete_one({"id": item_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Item not found")
    return {"ok": True}


# Sales / Checkout
@api_router.post("/sales/checkout", response_model=Sale)
async def checkout(payload: CheckoutRequest):
    if not payload.items:
        raise HTTPException(status_code=400, detail="No items in cart")

    lines: List[SaleLine] = []
    total = 0.0

    # Validate stock
    for ci in payload.items:
        doc = await db.items.find_one({"id": ci.item_id}, {"_id": 0})
        if not doc:
            raise HTTPException(status_code=404, detail=f"Item {ci.item_id} not found")
        if ci.qty <= 0:
            raise HTTPException(status_code=400, detail=f"Invalid qty for {doc['name']}")
        if doc.get("stock_qty", 0) < ci.qty:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient stock for {doc['name']} (have {doc.get('stock_qty', 0)})",
            )
        unit_price = float(doc["selling_price"])
        subtotal = unit_price * ci.qty
        total += subtotal
        lines.append(
            SaleLine(
                item_id=doc["id"],
                name=doc["name"],
                qty=ci.qty,
                unit_price=unit_price,
                subtotal=subtotal,
            )
        )

    # Apply stock decrement
    for ci in payload.items:
        await db.items.update_one(
            {"id": ci.item_id}, {"$inc": {"stock_qty": -ci.qty}}
        )

    sale = Sale(lines=lines, total=total)
    sale_doc = sale.model_dump()
    sale_doc["created_at"] = sale_doc["created_at"].isoformat()
    await db.sales.insert_one(sale_doc)
    return sale


@api_router.get("/sales", response_model=List[Sale])
async def list_sales():
    docs = await db.sales.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return [_clean(d) for d in docs]


# -------------------- Seed --------------------
SEED_ITEMS = [
    {"name": "Paracetamol 500mg", "barcode": "6291100100015", "buying_price": 750, "selling_price": 1250, "supplier": "Pioneer Pharma", "type": "Tablet", "stock_qty": 120},
    {"name": "Amoxicillin 250mg", "barcode": "6291100100022", "buying_price": 2500, "selling_price": 3500, "supplier": "Pioneer Pharma", "type": "Capsule", "stock_qty": 60},
    {"name": "Ibuprofen 400mg", "barcode": "6291100100039", "buying_price": 1000, "selling_price": 1750, "supplier": "Awa Medica", "type": "Tablet", "stock_qty": 90},
    {"name": "Vitamin C 1000mg", "barcode": "6291100100046", "buying_price": 3000, "selling_price": 5000, "supplier": "NutriPlus", "type": "Effervescent", "stock_qty": 45},
    {"name": "Cough Syrup 120ml", "barcode": "6291100100053", "buying_price": 2750, "selling_price": 4500, "supplier": "Awa Medica", "type": "Syrup", "stock_qty": 30},
    {"name": "Loratadine 10mg", "barcode": "6291100100060", "buying_price": 1500, "selling_price": 2500, "supplier": "Pioneer Pharma", "type": "Tablet", "stock_qty": 75},
    {"name": "Bandage Roll", "barcode": "6291100100077", "buying_price": 500, "selling_price": 1000, "supplier": "MedSupply Co", "type": "First Aid", "stock_qty": 200},
    {"name": "Antiseptic Solution 250ml", "barcode": "6291100100084", "buying_price": 2000, "selling_price": 3500, "supplier": "MedSupply Co", "type": "Antiseptic", "stock_qty": 40},
    {"name": "Insulin Pen", "barcode": "6291100100091", "buying_price": 18000, "selling_price": 25000, "supplier": "Novo Pharm", "type": "Injection", "stock_qty": 15},
    {"name": "Omeprazole 20mg", "barcode": "6291100100107", "buying_price": 2000, "selling_price": 3250, "supplier": "Awa Medica", "type": "Capsule", "stock_qty": 5},
    {"name": "Hydrocortisone Cream", "barcode": "6291100100114", "buying_price": 1750, "selling_price": 3000, "supplier": "DermaCare", "type": "Ointment", "stock_qty": 25},
    {"name": "Surgical Mask (50pcs)", "barcode": "6291100100121", "buying_price": 4000, "selling_price": 7500, "supplier": "MedSupply Co", "type": "PPE", "stock_qty": 80},
]


@app.on_event("startup")
async def seed_db():
    try:
        count = await db.items.count_documents({})
        if count == 0:
            for raw in SEED_ITEMS:
                item = Item(**raw)
                doc = item.model_dump()
                doc["created_at"] = doc["created_at"].isoformat()
                await db.items.insert_one(doc)
            logger.info(f"Seeded {len(SEED_ITEMS)} pharmacy items")
    except Exception as e:
        logging.exception("Seed failed: %s", e)


# Include the router
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
