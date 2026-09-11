"""
seed_marketplace_data.py
Seeds:
- 2 Active Vendors + Vendor Owners
- 2 Warehouses + Warehouse Managers / Staff
- 5 Verified Customer Accounts + Shipping/Billing Addresses
- Categories: Clothes, Shoes, Cosmetics, Aesthetic Gifts & Goods
- Brands: Atelier Milano, Lumiere Doux, Velvet & Sole, Aurelia Paris, Maison Flair, Botanique Pure
- 36 Real Luxury Products with variants, images, and inventory stock
"""
import os
import sys
from decimal import Decimal

# Ensure server path is in sys.path
sys.path.insert(0, os.path.abspath('.'))

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.dev')
import django
django.setup()

from django.contrib.auth import get_user_model
from django.utils.text import slugify
from accounts.models import Address, AddressType, RoleEnum
from vendors.models import Vendor, VendorStatus, VendorPolicy, VendorBankAccount, AccountType
from warehouse.models import Warehouse, WarehouseStaff, StaffRole, Inventory
from catalog.models import Category, Brand, Product, ProductStatus, ProductVariant, ProductImage

User = get_user_model()

DEFAULT_PASSWORD = "Zxcvbnm12345!"

def get_or_create_user(email, role, first_name, last_name, phone=None):
    user, created = User.objects.get_or_create(
        email=email,
        defaults={
            "role": role,
            "first_name": first_name,
            "last_name": last_name,
            "phone": phone,
            "is_verified": True,
            "is_active": True,
        }
    )
    user.role = role
    user.first_name = first_name
    user.last_name = last_name
    if phone and not user.phone:
        user.phone = phone
    user.is_verified = True
    user.is_active = True
    user.set_password(DEFAULT_PASSWORD)
    user.save()
    action = "Created" if created else "Updated"
    print(f"  [{action}] User: {email} | Role: {role}")
    return user


def run():
    print("=================================================================")
    print("LUXELANE MARKETPLACE SEEDING: VENDORS, WAREHOUSES, CUSTOMERS, CATALOG")
    print("=================================================================")

    # -----------------------------------------------------------------
    # 1. TWO PROPER VENDOR ACCOUNTS
    # -----------------------------------------------------------------
    print("\n--- 1. Seeding 2 Proper Vendors ---")
    
    # Vendor 1: Atelier Milano
    v1_owner = get_or_create_user(
        email="vendor.atelier@luxelane.com",
        role=RoleEnum.VENDOR_OWNER,
        first_name="Elena",
        last_name="Vance",
        phone="+390288451101"
    )
    v1, _ = Vendor.objects.get_or_create(
        slug="atelier-haute-couture",
        defaults={
            "owner_user": v1_owner,
            "legal_name": "Atelier Haute Couture Milano S.R.L.",
            "display_name": "Atelier Milano",
            "status": VendorStatus.ACTIVE,
            "description": "Italian haute couture maison renowned for handcrafted silk tailoring, virgin cashmere outerwear, and artisanal leather footwear.",
            "tax_id": "IT09876543211",
            "support_email": "concierge@ateliermilano.com",
            "support_phone": "+39 02 8845 1100",
            "logo_url": "https://images.unsplash.com/photo-1544441893-675973e31985?auto=format&fit=crop&q=80&w=400",
            "banner_url": "https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&q=80&w=1200",
        }
    )
    v1.owner_user = v1_owner
    v1.status = VendorStatus.ACTIVE
    v1.save()
    VendorPolicy.objects.get_or_create(
        vendor=v1,
        defaults={
            "return_window_days": 30,
            "return_policy_text": "Full refund upon receipt and condition verification at our Milan atelier.",
            "shipping_policy_text": "Complimentary insured express white-glove shipment across EU, UK, and North America.",
            "cancellation_policy_text": "Orders can be cancelled prior to atelier dispatch.",
        }
    )
    VendorBankAccount.objects.get_or_create(
        vendor=v1,
        is_primary=True,
        defaults={
            "bank_name": "UniCredit Banca Milano",
            "account_holder": "Atelier Haute Couture Milano S.R.L.",
            "account_type": AccountType.CHECKING,
            "routing_number": "02008",
            "account_number": "IT60X0200801622000000123456",
        }
    )
    print(f"  [OK] Vendor 1: {v1.display_name} ({v1.slug}) active.")

    # Vendor 2: Lumiere Doux Paris
    v2_owner = get_or_create_user(
        email="vendor.lumieredoux@luxelane.com",
        role=RoleEnum.VENDOR_OWNER,
        first_name="Camille",
        last_name="Rousseau",
        phone="+33142685501"
    )
    v2, _ = Vendor.objects.get_or_create(
        slug="lumiere-doux-botanicals",
        defaults={
            "owner_user": v2_owner,
            "legal_name": "Lumiere Doux Parfumerie & Cosmetiques S.A.",
            "display_name": "Lumiere Doux Paris",
            "status": VendorStatus.ACTIVE,
            "description": "Parisian botanical beauty house formulating rare extract extraits de parfum, gold-infused serums, and aesthetic artisanal home living gifts.",
            "tax_id": "FR45887219034",
            "support_email": "clientcare@lumieredoux.com",
            "support_phone": "+33 1 42 68 55 00",
            "logo_url": "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&q=80&w=400",
            "banner_url": "https://images.unsplash.com/photo-1512496015851-a90fb38ba796?auto=format&fit=crop&q=80&w=1200",
        }
    )
    v2.owner_user = v2_owner
    v2.status = VendorStatus.ACTIVE
    v2.save()
    VendorPolicy.objects.get_or_create(
        vendor=v2,
        defaults={
            "return_window_days": 14,
            "return_policy_text": "Sealed cosmetic and fragrance items eligible for 14-day complimentary returns.",
            "shipping_policy_text": "Dispatched in temperature-controlled sustainable packaging with complimentary signature samples.",
            "cancellation_policy_text": "Orders can be cancelled prior to fulfillment packaging.",
        }
    )
    VendorBankAccount.objects.get_or_create(
        vendor=v2,
        is_primary=True,
        defaults={
            "bank_name": "BNP Paribas Boulevard Haussmann",
            "account_holder": "Lumiere Doux Parfumerie & Cosmetiques S.A.",
            "account_type": AccountType.CHECKING,
            "routing_number": "30004",
            "account_number": "FR7630004013370001234567890",
        }
    )
    print(f"  [OK] Vendor 2: {v2.display_name} ({v2.slug}) active.")

    # -----------------------------------------------------------------
    # 2. TWO WAREHOUSE ACCOUNTS & FACILITIES
    # -----------------------------------------------------------------
    print("\n--- 2. Seeding 2 Warehouse Facilities & Staff Accounts ---")

    # Warehouse 1: Milan Navigli Hub (Linked to Atelier Milano)
    wh1_user = get_or_create_user(
        email="wh.milan@luxelane.com",
        role=RoleEnum.WAREHOUSE_MANAGER,
        first_name="Marco",
        last_name="Bellini",
        phone="+390234567801"
    )
    wh1_addr, _ = Address.objects.get_or_create(
        user=wh1_user,
        label="Milan Hub Facility",
        defaults={
            "line1": "Via Tortona 35",
            "line2": "Building 4, Bay 12",
            "city": "Milan",
            "state": "Lombardy",
            "country": "Italy",
            "postal_code": "20144",
            "type": AddressType.SHIPPING,
            "is_default": True,
            "contact_phone": "+390234567801",
        }
    )
    wh1, _ = Warehouse.objects.get_or_create(
        name="Milan Navigli Logistics Hub",
        defaults={
            "vendor": v1,
            "address": wh1_addr,
            "latitude": Decimal("45.451800"),
            "longitude": Decimal("9.160100"),
            "service_radius_km": Decimal("150.00"),
            "sla_hours": 12,
            "is_active": True,
        }
    )
    wh1.vendor = v1
    wh1.is_active = True
    wh1.save()
    WarehouseStaff.objects.get_or_create(
        warehouse=wh1,
        user=wh1_user,
        defaults={"staff_role": StaffRole.MANAGER}
    )
    print(f"  [OK] Warehouse 1: {wh1.name} (Manager: {wh1_user.email})")

    # Warehouse 2: Paris Saint-Germain DC (Linked to Lumiere Doux)
    wh2_user = get_or_create_user(
        email="wh.paris@luxelane.com",
        role=RoleEnum.WAREHOUSE_MANAGER,
        first_name="Antoine",
        last_name="Moreau",
        phone="+33145678901"
    )
    wh2_addr, _ = Address.objects.get_or_create(
        user=wh2_user,
        label="Paris Distribution Center",
        defaults={
            "line1": "18 Rue de l'Abbaye",
            "line2": "Quai de Seine Logistics",
            "city": "Paris",
            "state": "Ile-de-France",
            "country": "France",
            "postal_code": "75006",
            "type": AddressType.SHIPPING,
            "is_default": True,
            "contact_phone": "+33145678901",
        }
    )
    wh2, _ = Warehouse.objects.get_or_create(
        name="Paris Saint-Germain Distribution Center",
        defaults={
            "vendor": v2,
            "address": wh2_addr,
            "latitude": Decimal("48.853400"),
            "longitude": Decimal("2.334800"),
            "service_radius_km": Decimal("200.00"),
            "sla_hours": 12,
            "is_active": True,
        }
    )
    wh2.vendor = v2
    wh2.is_active = True
    wh2.save()
    WarehouseStaff.objects.get_or_create(
        warehouse=wh2,
        user=wh2_user,
        defaults={"staff_role": StaffRole.MANAGER}
    )
    print(f"  [OK] Warehouse 2: {wh2.name} (Manager: {wh2_user.email})")

    # -----------------------------------------------------------------
    # 3. FIVE CUSTOMER ACCOUNTS
    # -----------------------------------------------------------------
    print("\n--- 3. Seeding 5 Customer Accounts ---")
    customers_data = [
        {
            "email": "sophia.bennett@gmail.com",
            "first_name": "Sophia",
            "last_name": "Bennett",
            "phone": "+12125550141",
            "city": "New York",
            "line1": "1040 Fifth Avenue, Apt 9A",
            "state": "NY",
            "country": "US",
            "postal_code": "10028",
        },
        {
            "email": "alexander.wright@gmail.com",
            "first_name": "Alexander",
            "last_name": "Wright",
            "phone": "+12125550142",
            "city": "Beverly Hills",
            "line1": "9405 Wilshire Blvd, Suite 800",
            "state": "CA",
            "country": "US",
            "postal_code": "90212",
        },
        {
            "email": "isabella.rossi@gmail.com",
            "first_name": "Isabella",
            "last_name": "Rossi",
            "phone": "+39025550143",
            "city": "Milan",
            "line1": "Via Montenapoleone 18",
            "state": "Lombardy",
            "country": "Italy",
            "postal_code": "20121",
        },
        {
            "email": "charlotte.dubois@gmail.com",
            "first_name": "Charlotte",
            "last_name": "Dubois",
            "phone": "+3315550144",
            "city": "Paris",
            "line1": "26 Place Vendome",
            "state": "Ile-de-France",
            "country": "France",
            "postal_code": "75001",
        },
        {
            "email": "liam.chen@gmail.com",
            "first_name": "Liam",
            "last_name": "Chen",
            "phone": "+14155550145",
            "city": "San Francisco",
            "line1": "2200 Pacific Avenue, Penthouse B",
            "state": "CA",
            "country": "US",
            "postal_code": "94115",
        },
    ]

    for c in customers_data:
        cust_user = get_or_create_user(
            email=c["email"],
            role=RoleEnum.CUSTOMER,
            first_name=c["first_name"],
            last_name=c["last_name"],
            phone=c["phone"]
        )
        Address.objects.get_or_create(
            user=cust_user,
            is_default=True,
            defaults={
                "label": "Primary Residence",
                "line1": c["line1"],
                "city": c["city"],
                "state": c["state"],
                "country": c["country"],
                "postal_code": c["postal_code"],
                "type": AddressType.BOTH,
                "contact_phone": c["phone"],
            }
        )
        print(f"  [OK] Customer: {c['first_name']} {c['last_name']} <{c['email']}>")

    # -----------------------------------------------------------------
    # 4. CATEGORIES & BRANDS
    # -----------------------------------------------------------------
    print("\n--- 4. Seeding Categories & Brands ---")
    cat_defs = [
        ("clothes", "Clothes & Haute Couture", "Designer evening wear, pure cashmere knits, bespoke tailoring, and luxury outerwear."),
        ("shoes", "Luxury Footwear", "Hand-welted Italian leather loafers, sculptured stiletto pumps, and artisanal boots."),
        ("cosmetics", "Cosmetics & Fragrance", "Rare botanical skincare elixirs, Parisian extraits de parfum, and 24K restorative serums."),
        ("aesthetic-gifts", "Aesthetic Gifts & Living", "Artisanal scented candles, Murano crystal objets d'art, and handcrafted leather accessories."),
    ]
    categories = {}
    for slug, name, desc in cat_defs:
        cat, _ = Category.objects.get_or_create(
            slug=slug,
            defaults={"name": name, "is_active": True}
        )
        categories[slug] = cat

    brand_defs = [
        ("atelier-milano", "Atelier Milano"),
        ("lumiere-doux", "Lumiere Doux"),
        ("velvet-sole", "Velvet & Sole"),
        ("aurelia-paris", "Aurelia Paris"),
        ("maison-flair", "Maison Flair"),
        ("botanique-pure", "Botanique Pure"),
    ]
    brands = {}
    for slug, name in brand_defs:
        b, _ = Brand.objects.get_or_create(slug=slug, defaults={"name": name})
        brands[slug] = b

    # -----------------------------------------------------------------
    # 5. 36 CURATED LUXURY PRODUCTS (9 PER CATEGORY)
    # -----------------------------------------------------------------
    print("\n--- 5. Seeding 36 Luxury Products Across Focus Categories ---")

    catalog_data = [
        # ==========================================
        # CATEGORY 1: CLOTHES (9 PRODUCTS)
        # ==========================================
        {
            "category": "clothes",
            "vendor": v1,
            "warehouse": wh1,
            "brand": "atelier-milano",
            "title": "Silk Charmeuse Evening Slip Gown",
            "slug": "silk-charmeuse-evening-slip-gown",
            "price": Decimal("1450.00"),
            "compare_at": Decimal("1650.00"),
            "sku": "CLO-SCG-001",
            "weight": Decimal("0.45"),
            "desc": "Bias-cut 100% heavyweight mulberry silk charmeuse with an open back drape, delicate French seam finishes, and adjustable cord straps.",
            "image": "https://images.unsplash.com/photo-1566174053879-31528523f8ae?auto=format&fit=crop&q=80&w=1200",
        },
        {
            "category": "clothes",
            "vendor": v1,
            "warehouse": wh1,
            "brand": "atelier-milano",
            "title": "Pure Vicuna Tailored Double-Breasted Overcoat",
            "slug": "vicuna-tailored-double-breasted-overcoat",
            "price": Decimal("8900.00"),
            "compare_at": Decimal("9500.00"),
            "sku": "CLO-VCO-002",
            "weight": Decimal("1.85"),
            "desc": "Rare Andean un-dyed pure vicuna outerwear offering unmatched butter-soft thermal warmth. Features peak lapels, cupro lining, and horn fasteners.",
            "image": "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&q=80&w=1200",
        },
        {
            "category": "clothes",
            "vendor": v1,
            "warehouse": wh1,
            "brand": "atelier-milano",
            "title": "Milano Structured Wool Tuxedo Blazer",
            "slug": "milano-structured-wool-tuxedo-blazer",
            "price": Decimal("2250.00"),
            "compare_at": None,
            "sku": "CLO-MTB-003",
            "weight": Decimal("1.20"),
            "desc": "Impeccably tailored Super 160s virgin wool jacket featuring silk faille shawl lapels, jetted pockets, and handcrafted Milanese buttonhole stitchwork.",
            "image": "https://images.unsplash.com/photo-1507679799987-c73779587ccf?auto=format&fit=crop&q=80&w=1200",
        },
        {
            "category": "clothes",
            "vendor": v1,
            "warehouse": wh1,
            "brand": "atelier-milano",
            "title": "Pleated Silk Crepe Wide-Leg Trousers",
            "slug": "pleated-silk-crepe-wide-leg-trousers",
            "price": Decimal("980.00"),
            "compare_at": Decimal("1100.00"),
            "sku": "CLO-PST-004",
            "weight": Decimal("0.60"),
            "desc": "High-waisted fluid silhouette cut from heavy silk crepe de chine. Features sharp front double pleats, side slash pockets, and concealed waist closure.",
            "image": "https://images.unsplash.com/photo-1509631179647-0177331693ae?auto=format&fit=crop&q=80&w=1200",
        },
        {
            "category": "clothes",
            "vendor": v1,
            "warehouse": wh1,
            "brand": "atelier-milano",
            "title": "Ribbed Baby Cashmere Turtleneck Sweater",
            "slug": "ribbed-baby-cashmere-turtleneck-sweater",
            "price": Decimal("850.00"),
            "compare_at": None,
            "sku": "CLO-RCT-005",
            "weight": Decimal("0.55"),
            "desc": "Spun from pristine Mongolian baby cashmere down. Features a relaxed foldover collar, raglan sleeves, and ultra-fine ribbed hem detailing.",
            "image": "https://images.unsplash.com/photo-1434389677669-e08b4cac3105?auto=format&fit=crop&q=80&w=1200",
        },
        {
            "category": "clothes",
            "vendor": v1,
            "warehouse": wh1,
            "brand": "atelier-milano",
            "title": "Artisanal Belted Linen Resort Robe Coat",
            "slug": "artisanal-belted-linen-resort-robe-coat",
            "price": Decimal("1120.00"),
            "compare_at": Decimal("1300.00"),
            "sku": "CLO-ALR-006",
            "weight": Decimal("0.90"),
            "desc": "Woven from unbleached Normandy flax linen with raw fringed trims, dropped kimono sleeves, and a self-tie sash belt for effortless Riviera styling.",
            "image": "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&q=80&w=1200",
        },
        {
            "category": "clothes",
            "vendor": v1,
            "warehouse": wh1,
            "brand": "aurelia-paris",
            "title": "Embroidered Organza Cocktail Midi Dress",
            "slug": "embroidered-organza-cocktail-midi-dress",
            "price": Decimal("2600.00"),
            "compare_at": Decimal("2950.00"),
            "sku": "CLO-EOD-007",
            "weight": Decimal("0.70"),
            "desc": "Structured silk organza layered over tonal crepe lining, decorated with intricate tonal botanical threadwork embroidery and an A-line skirt flounce.",
            "image": "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&q=80&w=1200",
        },
        {
            "category": "clothes",
            "vendor": v1,
            "warehouse": wh1,
            "brand": "atelier-milano",
            "title": "Sea Island Cotton Poplin Formal Shirt",
            "slug": "sea-island-cotton-poplin-formal-shirt",
            "price": Decimal("540.00"),
            "compare_at": None,
            "sku": "CLO-SIC-008",
            "weight": Decimal("0.30"),
            "desc": "Hand-stitched West Indian Sea Island cotton poplin boasting a silky 200/2 thread count, mother-of-pearl buttons, and French double cuffs.",
            "image": "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?auto=format&fit=crop&q=80&w=1200",
        },
        {
            "category": "clothes",
            "vendor": v1,
            "warehouse": wh1,
            "brand": "atelier-milano",
            "title": "Supple Lambskin Suede Belted Trench Jacket",
            "slug": "lambskin-suede-belted-trench-jacket",
            "price": Decimal("3400.00"),
            "compare_at": Decimal("3800.00"),
            "sku": "CLO-LSB-009",
            "weight": Decimal("1.50"),
            "desc": "Featherweight Italian lamb suede brushed to a velvet touch. Features epaulettes, storm flap, horn buckles, and tailored silhouette.",
            "image": "https://images.unsplash.com/photo-1551028719-00167b16eac5?auto=format&fit=crop&q=80&w=1200",
        },

        # ==========================================
        # CATEGORY 2: SHOES (9 PRODUCTS)
        # ==========================================
        {
            "category": "shoes",
            "vendor": v1,
            "warehouse": wh1,
            "brand": "velvet-sole",
            "title": "Venetian Calfskin Penny Loafers",
            "slug": "venetian-calfskin-penny-loafers",
            "price": Decimal("1150.00"),
            "compare_at": Decimal("1300.00"),
            "sku": "SHO-VCP-010",
            "weight": Decimal("0.95"),
            "desc": "Hand-lasted Italian box calfskin loafers with Blake-stitched leather soles, memory foam footbed, and hand-burnished espresso patina.",
            "image": "https://images.unsplash.com/photo-1614252235316-8c857d38b5f4?auto=format&fit=crop&q=80&w=1200",
        },
        {
            "category": "shoes",
            "vendor": v1,
            "warehouse": wh1,
            "brand": "aurelia-paris",
            "title": "Sculpted Stiletto Patent Leather Pumps 105",
            "slug": "sculpted-stiletto-patent-leather-pumps-105",
            "price": Decimal("1280.00"),
            "compare_at": None,
            "sku": "SHO-SSP-011",
            "weight": Decimal("0.65"),
            "desc": "Glossy Parisian patent leather high heels with a sharp pointed toe, 105mm architectural gold-dipped stiletto, and signature lacquered sole.",
            "image": "https://images.unsplash.com/photo-1543163521-1bf539c55dd2?auto=format&fit=crop&q=80&w=1200",
        },
        {
            "category": "shoes",
            "vendor": v1,
            "warehouse": wh1,
            "brand": "velvet-sole",
            "title": "Burnished Italian Leather Chelsea Boots",
            "slug": "burnished-italian-leather-chelsea-boots",
            "price": Decimal("1650.00"),
            "compare_at": Decimal("1850.00"),
            "sku": "SHO-BLC-012",
            "weight": Decimal("1.40"),
            "desc": "Single-piece wholecut calf leather upper with elasticated tonal side gussets, Goodyear-welt construction, and stacked beveled heel.",
            "image": "https://images.unsplash.com/photo-1638247025967-b4e38f787b76?auto=format&fit=crop&q=80&w=1200",
        },
        {
            "category": "shoes",
            "vendor": v1,
            "warehouse": wh1,
            "brand": "velvet-sole",
            "title": "Minimalist Nappa Leather Low-Top Court Sneakers",
            "slug": "minimalist-nappa-leather-low-top-court-sneakers",
            "price": Decimal("720.00"),
            "compare_at": None,
            "sku": "SHO-MNL-013",
            "weight": Decimal("0.85"),
            "desc": "Buttery soft full-grain white nappa leather upper, calfskin lining, Margom rubber cupsole, and understated gold foil serial stamp.",
            "image": "https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?auto=format&fit=crop&q=80&w=1200",
        },
        {
            "category": "shoes",
            "vendor": v1,
            "warehouse": wh1,
            "brand": "aurelia-paris",
            "title": "Velour Crystal-Embellished Evening Mules",
            "slug": "velour-crystal-embellished-evening-mules",
            "price": Decimal("1420.00"),
            "compare_at": Decimal("1600.00"),
            "sku": "SHO-VCE-014",
            "weight": Decimal("0.55"),
            "desc": "Midnight velvet vamp adorned with emerald-cut pavé crystal brooch, backless slip-on profile, and 75mm sculpted kitten heel.",
            "image": "https://images.unsplash.com/photo-1535043934128-cf0b28d52f95?auto=format&fit=crop&q=80&w=1200",
        },
        {
            "category": "shoes",
            "vendor": v1,
            "warehouse": wh1,
            "brand": "velvet-sole",
            "title": "Suede Tassel Driving Moccasins",
            "slug": "suede-tassel-driving-moccasins",
            "price": Decimal("890.00"),
            "compare_at": None,
            "sku": "SHO-STD-015",
            "weight": Decimal("0.75"),
            "desc": "Supple navy calf suede hand-stitched on the last, finished with knotted leather tassels and studded pebble gommino rubber driving nubs.",
            "image": "https://images.unsplash.com/photo-1560343090-f0409e92791a?auto=format&fit=crop&q=80&w=1200",
        },
        {
            "category": "shoes",
            "vendor": v1,
            "warehouse": wh1,
            "brand": "velvet-sole",
            "title": "Lug-Sole Equestrian Leather Riding Boots",
            "slug": "lug-sole-equestrian-leather-riding-boots",
            "price": Decimal("2100.00"),
            "compare_at": Decimal("2400.00"),
            "sku": "SHO-LER-016",
            "weight": Decimal("1.90"),
            "desc": "Tall knee-high equestrian silhouette in vegetable-tanned French bridle leather, equipped with Vibram commando lug sole and internal pull tabs.",
            "image": "https://images.unsplash.com/photo-1582588678413-dbf45f4823e9?auto=format&fit=crop&q=80&w=1200",
        },
        {
            "category": "shoes",
            "vendor": v1,
            "warehouse": wh1,
            "brand": "aurelia-paris",
            "title": "Braided Leather Strappy Sandal Heels",
            "slug": "braided-leather-strappy-sandal-heels",
            "price": Decimal("950.00"),
            "compare_at": None,
            "sku": "SHO-BLS-017",
            "weight": Decimal("0.50"),
            "desc": "Interwoven metallic gold lambskin micro-straps wrapping the ankle, square open toe, and slim 90mm covered column heel.",
            "image": "https://images.unsplash.com/photo-1525966222134-fcfa99b8ae77?auto=format&fit=crop&q=80&w=1200",
        },
        {
            "category": "shoes",
            "vendor": v1,
            "warehouse": wh1,
            "brand": "velvet-sole",
            "title": "Goodyear-Welted Double Monk Strap Shoes",
            "slug": "goodyear-welted-double-monk-strap-shoes",
            "price": Decimal("1350.00"),
            "compare_at": Decimal("1500.00"),
            "sku": "SHO-GDM-018",
            "weight": Decimal("1.10"),
            "desc": "Full-grain calf leather with hand-painted burgundy museum patina, dual solid palladium buckles, and channeled oak-bark tanned leather soles.",
            "image": "https://images.unsplash.com/photo-1533867617858-e7b97e060509?auto=format&fit=crop&q=80&w=1200",
        },

        # ==========================================
        # CATEGORY 3: COSMETICS (9 PRODUCTS)
        # ==========================================
        {
            "category": "cosmetics",
            "vendor": v2,
            "warehouse": wh2,
            "brand": "lumiere-doux",
            "title": "Rose Damascena Absolute Eau de Parfum",
            "slug": "rose-damascena-absolute-eau-de-parfum",
            "price": Decimal("380.00"),
            "compare_at": Decimal("420.00"),
            "sku": "COS-RDA-019",
            "weight": Decimal("0.40"),
            "desc": "Hand-harvested Grasse May Rose absolute layered over Sicilian bergamot, creamy ambergris, and Haitian vetiver in a weighted crystal flacon.",
            "image": "https://images.unsplash.com/photo-1592945403244-b3fbafd7f539?auto=format&fit=crop&q=80&w=1200",
        },
        {
            "category": "cosmetics",
            "vendor": v2,
            "warehouse": wh2,
            "brand": "botanique-pure",
            "title": "24K Gold Cellular Renewal Infusion Serum",
            "slug": "24k-gold-cellular-renewal-infusion-serum",
            "price": Decimal("495.00"),
            "compare_at": None,
            "sku": "COS-24K-020",
            "weight": Decimal("0.25"),
            "desc": "Potent anti-aging nectar infused with suspended 24K gold flakes, marine bio-ferment, and quadruple hyaluronic acid complex.",
            "image": "https://images.unsplash.com/photo-1620916566398-39f1143ab7be?auto=format&fit=crop&q=80&w=1200",
        },
        {
            "category": "cosmetics",
            "vendor": v2,
            "warehouse": wh2,
            "brand": "lumiere-doux",
            "title": "Velvet Matte Satin Lip Jewel Trio",
            "slug": "velvet-matte-satin-lip-jewel-trio",
            "price": Decimal("165.00"),
            "compare_at": Decimal("195.00"),
            "sku": "COS-VMS-021",
            "weight": Decimal("0.20"),
            "desc": "Three iconic Parisian shades in engraved fluted gold cases. Enriched with wild camellia oil for 12-hour weightless hydration and velvety finish.",
            "image": "https://images.unsplash.com/photo-1586495777744-4413f21062fa?auto=format&fit=crop&q=80&w=1200",
        },
        {
            "category": "cosmetics",
            "vendor": v2,
            "warehouse": wh2,
            "brand": "lumiere-doux",
            "title": "Santal Imperial Extrait de Parfum 100ml",
            "slug": "santal-imperial-extrait-de-parfum-100ml",
            "price": Decimal("440.00"),
            "compare_at": None,
            "sku": "COS-SIE-022",
            "weight": Decimal("0.45"),
            "desc": "35% oil concentration highlighting Mysore sandalwood, smoky cardamom, crushed violet leaves, and sensual tonka bean heart.",
            "image": "https://images.unsplash.com/photo-1523293182086-7651a899d37f?auto=format&fit=crop&q=80&w=1200",
        },
        {
            "category": "cosmetics",
            "vendor": v2,
            "warehouse": wh2,
            "brand": "botanique-pure",
            "title": "Botanical Camellia Supreme Facial Treatment Oil",
            "slug": "botanical-camellia-supreme-facial-treatment-oil",
            "price": Decimal("220.00"),
            "compare_at": Decimal("250.00"),
            "sku": "COS-BCS-023",
            "weight": Decimal("0.20"),
            "desc": "Cold-pressed Jeju island camellia seed oil blended with sea buckthorn and squalane for intense skin barrier repair and glass-skin radiance.",
            "image": "https://images.unsplash.com/photo-1608248597359-009dfd00c406?auto=format&fit=crop&q=80&w=1200",
        },
        {
            "category": "cosmetics",
            "vendor": v2,
            "warehouse": wh2,
            "brand": "lumiere-doux",
            "title": "Luminous Silk Bronzing & Illuminating Palette",
            "slug": "luminous-silk-bronzing-illuminating-palette",
            "price": Decimal("145.00"),
            "compare_at": None,
            "sku": "COS-LSB-024",
            "weight": Decimal("0.18"),
            "desc": "Ultra-micronized powders formulated with pearl pigment technology, providing natural warm sun-kissed contour and candlelit highlighter glow.",
            "image": "https://images.unsplash.com/photo-1512496015851-a90fb38ba796?auto=format&fit=crop&q=80&w=1200",
        },
        {
            "category": "cosmetics",
            "vendor": v2,
            "warehouse": wh2,
            "brand": "botanique-pure",
            "title": "Botanical Clarifying Cleansing Balm",
            "slug": "botanical-clarifying-cleansing-balm",
            "price": Decimal("110.00"),
            "compare_at": Decimal("130.00"),
            "sku": "COS-BCC-025",
            "weight": Decimal("0.35"),
            "desc": "Melt-to-milk balm composed of moringa butter, blue tansy, and wild chamomile. Dissolves waterproof makeup without stripping skin moisture.",
            "image": "https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&q=80&w=1200",
        },
        {
            "category": "cosmetics",
            "vendor": v2,
            "warehouse": wh2,
            "brand": "botanique-pure",
            "title": "Overnight Restorative Peptide Night Cream",
            "slug": "overnight-restorative-peptide-night-cream",
            "price": Decimal("285.00"),
            "compare_at": Decimal("320.00"),
            "sku": "COS-ORP-026",
            "weight": Decimal("0.30"),
            "desc": "Rich restorative balm infused with matrixyl 3000 peptides, ceramides, and fermented yeast extract to firm, hydrate, and plump overnight.",
            "image": "https://images.unsplash.com/photo-1571781926291-c477ebfd024b?auto=format&fit=crop&q=80&w=1200",
        },
        {
            "category": "cosmetics",
            "vendor": v2,
            "warehouse": wh2,
            "brand": "lumiere-doux",
            "title": "Rare Neroli & Fleur d'Oranger Hydrating Face Mist",
            "slug": "rare-neroli-fleur-doranger-hydrating-face-mist",
            "price": Decimal("95.00"),
            "compare_at": None,
            "sku": "COS-RNF-027",
            "weight": Decimal("0.28"),
            "desc": "Steam-distilled Tunisian orange blossom hydrosol blended with alpine glacier water to refresh makeup, calm redness, and revitalize skin.",
            "image": "https://images.unsplash.com/photo-1527799820374-dcf8d9d4a388?auto=format&fit=crop&q=80&w=1200",
        },

        # ==========================================
        # CATEGORY 4: AESTHETIC GIFTS & LIVING (9 PRODUCTS)
        # ==========================================
        {
            "category": "aesthetic-gifts",
            "vendor": v2,
            "warehouse": wh2,
            "brand": "maison-flair",
            "title": "Hand-Poured Amber & Smoked Santal Luxury Bougie",
            "slug": "amber-smoked-santal-luxury-bougie-candle",
            "price": Decimal("135.00"),
            "compare_at": Decimal("150.00"),
            "sku": "GFT-ASS-028",
            "weight": Decimal("0.85"),
            "desc": "450g coconut wax candle housed in hand-blown smoked black glass. Notes of dry sandalwood, cracked amber, frankincense, and dark cedar. 80-hour burn.",
            "image": "https://images.unsplash.com/photo-1603006905003-be475563bc59?auto=format&fit=crop&q=80&w=1200",
        },
        {
            "category": "aesthetic-gifts",
            "vendor": v2,
            "warehouse": wh2,
            "brand": "maison-flair",
            "title": "Fluted Murano Crystal Flower Vase",
            "slug": "fluted-murano-crystal-flower-vase",
            "price": Decimal("680.00"),
            "compare_at": None,
            "sku": "GFT-FMC-029",
            "weight": Decimal("2.10"),
            "desc": "Hand-blown in Murano, Venice by master glass artisans. Features optical vertical fluting with an iridescent champagne tint and weighted base.",
            "image": "https://images.unsplash.com/photo-1578749556568-bc2c40e68b61?auto=format&fit=crop&q=80&w=1200",
        },
        {
            "category": "aesthetic-gifts",
            "vendor": v1,
            "warehouse": wh1,
            "brand": "atelier-milano",
            "title": "Monogrammed Grained Calfskin Jewelry Case",
            "slug": "monogrammed-grained-calfskin-jewelry-case",
            "price": Decimal("890.00"),
            "compare_at": Decimal("1050.00"),
            "sku": "GFT-MGC-030",
            "weight": Decimal("1.20"),
            "desc": "Structured travel coffer in saddle-stitched pebbled calf leather, lined in anti-tarnish micro-suede with ring rolls and earring compartments.",
            "image": "https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?auto=format&fit=crop&q=80&w=1200",
        },
        {
            "category": "aesthetic-gifts",
            "vendor": v2,
            "warehouse": wh2,
            "brand": "lumiere-doux",
            "title": "Mulberry Silk Pillowcase & Contoured Sleep Mask Set",
            "slug": "mulberry-silk-pillowcase-contoured-sleep-mask-set",
            "price": Decimal("240.00"),
            "compare_at": Decimal("280.00"),
            "sku": "GFT-MSP-031",
            "weight": Decimal("0.40"),
            "desc": "22-Momme OEKO-TEX certified grade 6A mulberry silk set in champagne ivory, protecting hair cuticle from friction and reducing facial sleep lines.",
            "image": "https://images.unsplash.com/photo-1584100936595-c0654b55a2e2?auto=format&fit=crop&q=80&w=1200",
        },
        {
            "category": "aesthetic-gifts",
            "vendor": v2,
            "warehouse": wh2,
            "brand": "maison-flair",
            "title": "Hand-Forged Solid Brass Incense Burner",
            "slug": "hand-forged-solid-brass-incense-burner",
            "price": Decimal("320.00"),
            "compare_at": None,
            "sku": "GFT-HFS-032",
            "weight": Decimal("1.10"),
            "desc": "Minimalist Japanese-inspired incense holder lathe-turned from unlacquered solid brass, engineered to catch ash with a matching tray.",
            "image": "https://images.unsplash.com/photo-1506806732259-39c2d0268443?auto=format&fit=crop&q=80&w=1200",
        },
        {
            "category": "aesthetic-gifts",
            "vendor": v2,
            "warehouse": wh2,
            "brand": "maison-flair",
            "title": "Artisanal Speckled Ceramic Tea & Coffee Service",
            "slug": "artisanal-speckled-ceramic-tea-coffee-service",
            "price": Decimal("450.00"),
            "compare_at": Decimal("520.00"),
            "sku": "GFT-ASC-033",
            "weight": Decimal("2.30"),
            "desc": "Six-piece stoneware service thrown by hand in Kyoto. Features raw matte iron-speckled exterior with food-safe silky celadon glaze inside.",
            "image": "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&q=80&w=1200",
        },
        {
            "category": "aesthetic-gifts",
            "vendor": v1,
            "warehouse": wh1,
            "brand": "atelier-milano",
            "title": "Fine Italian Cashmere Fringe Throw Blanket",
            "slug": "fine-italian-cashmere-fringe-throw-blanket",
            "price": Decimal("980.00"),
            "compare_at": Decimal("1150.00"),
            "sku": "GFT-FIC-034",
            "weight": Decimal("0.95"),
            "desc": "100% Piedmontese virgin cashmere throw in warm oatmeal herringbone weave with twisted fringe borders. Measures 140cm x 180cm.",
            "image": "https://images.unsplash.com/photo-1580301762395-21ce84d00bc6?auto=format&fit=crop&q=80&w=1200",
        },
        {
            "category": "aesthetic-gifts",
            "vendor": v2,
            "warehouse": wh2,
            "brand": "maison-flair",
            "title": "Polished Travertine Marble Catchall Tray",
            "slug": "polished-travertine-marble-catchall-tray",
            "price": Decimal("290.00"),
            "compare_at": None,
            "sku": "GFT-PTM-035",
            "weight": Decimal("2.40"),
            "desc": "Carved from a single block of Roman beige travertine with natural unfilled pores, honed bevel edge, and non-scratch velvet underside.",
            "image": "https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&q=80&w=1200",
        },
        {
            "category": "aesthetic-gifts",
            "vendor": v1,
            "warehouse": wh1,
            "brand": "atelier-milano",
            "title": "Bespoke Leather Watch & Cufflinks Travel Roll",
            "slug": "bespoke-leather-watch-cufflinks-travel-roll",
            "price": Decimal("560.00"),
            "compare_at": Decimal("640.00"),
            "sku": "GFT-BLW-036",
            "weight": Decimal("0.60"),
            "desc": "Hand-stitched English bridle leather roll with three removable padded watch cushions, a hidden snap compartment for rings and cufflinks, and brass snap closures.",
            "image": "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&q=80&w=1200",
        },
    ]

    for pdata in catalog_data:
        cat = categories[pdata["category"]]
        vendor = pdata["vendor"]
        wh = pdata["warehouse"]
        brand = brands[pdata["brand"]]

        product, _ = Product.objects.get_or_create(
            slug=pdata["slug"],
            defaults={
                "vendor": vendor,
                "category": cat,
                "brand": brand,
                "title": pdata["title"],
                "description": pdata["desc"],
                "base_price": pdata["price"],
                "status": ProductStatus.APPROVED,
                "is_active": True,
            }
        )
        product.vendor = vendor
        product.category = cat
        product.brand = brand
        product.title = pdata["title"]
        product.description = pdata["desc"]
        product.base_price = pdata["price"]
        product.status = ProductStatus.APPROVED
        product.is_active = True
        product.save()

        # Variant
        variant, _ = ProductVariant.objects.get_or_create(
            product=product,
            sku=pdata["sku"],
            defaults={
                "price": pdata["price"],
                "compare_at_price": pdata["compare_at"],
                "weight_kg": pdata["weight"],
                "is_active": True,
            }
        )
        variant.price = pdata["price"]
        variant.compare_at_price = pdata["compare_at"]
        variant.weight_kg = pdata["weight"]
        variant.is_active = True
        variant.save()

        # Product Image
        ProductImage.objects.get_or_create(
            product=product,
            image_url=pdata["image"],
            defaults={
                "variant": variant,
                "sort_order": 0,
                "is_primary": True,
            }
        )

        # Inventory in designated warehouse
        inv, _ = Inventory.objects.get_or_create(
            variant=variant,
            warehouse=wh,
            defaults={
                "on_hand": 75,
                "reserved_cache": 0,
                "reorder_threshold": 10,
            }
        )
        if inv.on_hand < 15:
            inv.on_hand = 75
            inv.save()

        print(f"  [OK] [{cat.name[:8]}] {product.title[:38]:<38} | ${product.base_price:>7} | Stock: {inv.on_hand} in {wh.name[:20]}")

    total_products = Product.objects.filter(status=ProductStatus.APPROVED, is_active=True).count()
    total_variants = ProductVariant.objects.filter(is_active=True).count()
    print("\n=================================================================")
    print(f"[SUCCESS] Total Approved Active Products in Storefront: {total_products}")
    print(f"[SUCCESS] Total Active Variant SKUs: {total_variants}")
    print("=================================================================")


if __name__ == "__main__":
    run()
