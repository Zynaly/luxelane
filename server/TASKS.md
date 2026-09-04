# 🛍️ LuxeLane — Django Backend: Task Monitor

**Stack:** Django 5.x + DRF · PostgreSQL 16 · Redis + Celery · SimpleJWT · Stripe Connect · EasyPost/Shippo · drf-spectacular  
**Base URL:** `/api/v1/`  
**Spec:** [`ecommerce-backend-detailed-spec.md`](./ecommerce-backend-detailed-spec.md)  
**Venv:** `server/venv/` · activate with `.\venv\Scripts\activate`

---

## 📊 Overall Progress

| Sprint | Name | Endpoints | Status | Progress |
|--------|------|-----------|--------|----------|
| 0 | Foundations | 4 | ✅ Complete | ██████████ 100% |
| 1 | Identity & RBAC | 15 | ✅ Complete | ██████████ 100% |
| 2 | Profiles, Addresses, Media, Audit, Notifications | 7 | ✅ Complete | ██████████ 100% |
| 3 | Vendors, KYC, Staff, Commission | 14 | ⏳ Pending | ░░░░░░░░░░ 0% |
| 4 | Catalog Core & Moderation | 12 | ⏳ Pending | ░░░░░░░░░░ 0% |
| 5 | Variants, Attributes & Search | 9 | ⏳ Pending | ░░░░░░░░░░ 0% |
| 6 | Warehouse & Inventory Core | 15 | ⏳ Pending | ░░░░░░░░░░ 0% |
| 7 | Reservations, Allocation & Smart Routing | 2 | ⏳ Pending | ░░░░░░░░░░ 0% |
| 8 | Cart, Pricing & Promotions | 12 | ⏳ Pending | ░░░░░░░░░░ 0% |
| 9 | Shipping Rates & Packing | 4 | ⏳ Pending | ░░░░░░░░░░ 0% |
| 10 | Orders & Checkout Orchestration | 12 | ⏳ Pending | ░░░░░░░░░░ 0% |
| 11 | Online Payments & Webhooks | 10 | ⏳ Pending | ░░░░░░░░░░ 0% |
| 12 | Ledger, Escrow, Wallet & COD | 7 | ⏳ Pending | ░░░░░░░░░░ 0% |
| 13 | Shipments, Labels & Tracking | 8 | ⏳ Pending | ░░░░░░░░░░ 0% |
| 14 | Returns, Refunds, Reviews & Q&A | 12 | ⏳ Pending | ░░░░░░░░░░ 0% |
| 15 | Payouts, Reconciliation & Admin Reporting | 10 | ⏳ Pending | ░░░░░░░░░░ 0% |
| 16 | Launch Hardening | — | ⏳ Pending | ░░░░░░░░░░ 0% |

**Total Endpoints: ~153 · Apps: 10**

---

## 🏗️ Sprint 0 — Foundations

> No business REST API. Infrastructure, project scaffold, core utilities, health checks.

### Tasks

- [x] **S0-T1** Create venv in `server/venv/` and install all dependencies
- [x] **S0-T2** Create `requirements.txt`
- [x] **S0-T3** Create `docker-compose.yml` (Postgres 16 + Redis 7)
- [x] **S0-T4** Create `.env.example`
- [x] **S0-T5** Scaffold Django project with `config/` package (settings/base, dev, prod)
- [x] **S0-T6** Create `core` app with abstract `BaseModel`
- [x] **S0-T7** Configure Celery app (`config/celery_app.py`)
- [x] **S0-T8** Configure drf-spectacular (OpenAPI schema + Swagger UI)
- [x] **S0-T9** Implement `GET /healthz/` — `HealthCheckView`
- [x] **S0-T10** Implement `GET /readyz/` — `ReadinessCheckView` (DB + Redis + Celery)
- [x] **S0-T11** Create `FakeGateway` stub (`payments/gateways/fake.py`)
- [x] **S0-T12** Create `FakeCarrier` stub (`shipping/carriers/fake.py`)
- [x] **S0-T13** Root URL router with `/api/v1/` versioning
- [x] **S0-T14** `AuditLogMiddleware` stub in `core/middleware.py`
- [x] **S0-T15** Run initial migrations + smoke-test `/healthz/` ✅ 200 OK · `/readyz/` ✅ 503 (Redis offline, expected)

**S0 Status: ✅ Complete** — `django check` clean · migrations applied · both endpoints live

---

## 🔐 Sprint 1 — Identity & RBAC

> Models: `User`, `OTPVerification`, `SocialAccount`

### Tasks

- [x] **S1-T1** Create `accounts` app
- [x] **S1-T2** `User` model — custom AbstractUser (email, phone, role enum, is_verified, 2FA, avatar_url)
- [x] **S1-T3** `OTPVerification` model — code_hash, purpose, expires_at, attempts, consumed_at
- [x] **S1-T4** `SocialAccount` model — provider, provider_uid
- [x] **S1-T5** Migrations for `accounts`
- [x] **S1-T6** Permission classes — `IsSuperAdmin`, `IsPlatformAdmin`, `IsFinanceAdmin`, `IsVendorMember`, `IsWarehouseMember`, `IsAssignedDeliveryAgent`, `IsObjectOwner`
- [x] **S1-T7** `UserRegisterSerializer` + `VendorRegisterSerializer` (transaction: User + Vendor(pending))
- [x] **S1-T8** `LoginSerializer` + throttled `LoginView` (5/min AnonRateThrottle)
- [x] **S1-T9** `TokenRefreshView` (SimpleJWT rotation + blacklist) + `TokenVerifyView`
- [x] **S1-T10** `LogoutView` — blacklists refresh token
- [x] **S1-T11** OTP service — `generate_otp()`, `verify_otp()`, `send_otp()` (email/SMS stubs)
- [x] **S1-T12** `OTPRequestView`, `OTPVerifyView`, `OTPResendView`
- [x] **S1-T13** `PasswordForgotView`, `PasswordResetView`, `PasswordChangeView`
- [x] **S1-T14** `TwoFactorEnableView` + `TwoFactorVerifyView`
- [x] **S1-T15** `UserMeView (RetrieveUpdateAPIView)`
- [x] **S1-T16** `AdminUserViewSet` (list/retrieve) + `AdminUserStatusUpdateView` (patch + AuditLog)
- [x] **S1-T17** Wire all Sprint 1 URLs under `/api/v1/auth/`, `/api/v1/users/`, `/api/v1/admin/`

**S1 Status: ✅ Complete** — 12 unit tests passing · OpenAPI schema verified · DB migrated

---

## 👤 Sprint 2 — Profiles, Addresses, Media, Audit, Notifications

> Models: `Address`, `AuditLog`, `Notification`, `NotificationTemplate`, `NotificationPreference`

### Tasks

- [x] **S2-T1** `Address` model — lat/lng, type, is_default, contact_phone
- [x] **S2-T2** `AuditLog` model — append-only, actor, action, before/after JSON diff, ip_address
- [x] **S2-T3** `Notification`, `NotificationTemplate`, `NotificationPreference` models
- [x] **S2-T4** Migrations
- [x] **S2-T5** `AddressViewSet (ModelViewSet)` — owner-scoped CRUD
- [x] **S2-T6** `AddressValidateView` — geocoding adapter stub (normalize + lat/lng)
- [x] **S2-T7** `MediaPresignedUploadView` — S3/MinIO presigned PUT stub
- [x] **S2-T8** `NotificationViewSet` — list + `mark_read` action
- [x] **S2-T9** `NotificationPreferenceViewSet` — list + update
- [x] **S2-T10** Complete `AuditLogMiddleware` — hooks on admin-role mutating requests
- [x] **S2-T11** Wire all Sprint 2 URLs

**S2 Status: ✅ Complete** — 20 total unit tests passing · OpenAPI schema 0 errors · Migrations applied

---

## 🏪 Sprint 3 — Vendors, KYC, Staff, Commission

> Models: `Vendor`, `VendorStaff`, `VendorDocument`, `VendorBankAccount`, `VendorPolicy`, `CommissionRule`, `VendorPayout`, `PayoutLineItem`, `PayoutAdjustment`

### Tasks

- [ ] **S3-T1** Create `vendors` app
- [ ] **S3-T2** `Vendor` model — status FSM, slug, rating denorm
- [ ] **S3-T3** `VendorStaff`, `VendorDocument`, `VendorBankAccount` (encrypted, masked) models
- [ ] **S3-T4** `VendorPolicy` (OneToOne), `CommissionRule` models
- [ ] **S3-T5** `VendorPayout`, `PayoutLineItem`, `PayoutAdjustment` models
- [ ] **S3-T6** Migrations
- [ ] **S3-T7** `VendorApplicationView` + `VendorMeViewSet`
- [ ] **S3-T8** `VendorStorefrontView` — public, lookup by slug
- [ ] **S3-T9** `VendorStaffViewSet`, `VendorBankAccountViewSet`, `VendorDocumentViewSet`
- [ ] **S3-T10** `VendorPolicyView (RetrieveUpdateAPIView)`
- [ ] **S3-T11** `AdminVendorViewSet` + `AdminVendorStatusUpdateView` (AuditLog + Celery Stripe Connect task)
- [ ] **S3-T12** `AdminVendorDocumentReviewView`
- [ ] **S3-T13** `AdminCommissionRuleViewSet`
- [ ] **S3-T14** `ScopedToVendorMixin` — queryset scoped to vendor from VendorStaff membership
- [ ] **S3-T15** Wire all Sprint 3 URLs

**S3 Status: ⏳ Pending**

---

## 📦 Sprint 4 — Catalog Core & Moderation

> Models: `Category` (MPTT), `Brand`, `Product`, `ProductImage`, `ProductTag`

### Tasks

- [ ] **S4-T1** Create `catalog` app
- [ ] **S4-T2** `Category` model with `django-mptt` tree structure
- [ ] **S4-T3** `Brand`, `Product` (search_vector GIN index), `ProductImage`, `ProductTag` models
- [ ] **S4-T4** Migrations (incl. GIN index on search_vector)
- [ ] **S4-T5** `CategoryViewSet` (public read) + `AdminCategoryViewSet` (admin CRUD)
- [ ] **S4-T6** `BrandViewSet` (public read) + `AdminBrandViewSet` (admin CRUD)
- [ ] **S4-T7** `ProductViewSet` — public approved list/detail
- [ ] **S4-T8** `VendorMyProductsViewSet` — vendor's own products (all statuses)
- [ ] **S4-T9** `AdminProductModerationView` — approve/reject (AuditLog + vendor Notification)
- [ ] **S4-T10** `VendorProductBulkImportView` — CSV/XLSX → Celery task → `job_id`
- [ ] **S4-T11** `BulkImportStatusView` — poll job status + per-row report
- [ ] **S4-T12** Wire all Sprint 4 URLs

**S4 Status: ⏳ Pending**

---

## 🎨 Sprint 5 — Variants, Attributes & Search

> Models: `ProductAttribute`, `ProductAttributeValue`, `ProductVariant`, `ProductVariantAttribute`, `Wishlist`

### Tasks

- [ ] **S5-T1** `ProductAttribute`, `ProductAttributeValue` models
- [ ] **S5-T2** `ProductVariant` (SKU, price, dimensions), `ProductVariantAttribute` models
- [ ] **S5-T3** `Wishlist` model
- [ ] **S5-T4** Migrations
- [ ] **S5-T5** `ProductVariantViewSet` — nested under product, vendor-owner write
- [ ] **S5-T6** `ProductVariantGenerateView` — cartesian product of attribute-value groups (service call)
- [ ] **S5-T7** `ProductAttributeViewSet` — public read / admin write
- [ ] **S5-T8** `ProductSearchView` — full-text + django-filter + facets (Redis cache 60s)
- [ ] **S5-T9** `ProductRelatedView` — same category, exclude self, order by rating
- [ ] **S5-T10** `WishlistViewSet` — list/create/destroy, owner-scoped
- [ ] **S5-T11** Wire all Sprint 5 URLs

**S5 Status: ⏳ Pending**

---

## 🏭 Sprint 6 — Warehouse & Inventory Core

> Models: `Warehouse`, `WarehouseStaff`, `Inventory`, `StockMovement`, `StockTransfer`, `StockTransferItem`, `PurchaseOrder`, `PurchaseOrderItem`

### Tasks

- [ ] **S6-T1** Create `warehouse` app
- [ ] **S6-T2** `Warehouse`, `WarehouseStaff` models
- [ ] **S6-T3** `Inventory` model — on_hand, reserved_cache, reorder_threshold
- [ ] **S6-T4** `StockMovement` (append-only), `StockTransfer`, `StockTransferItem` models
- [ ] **S6-T5** `PurchaseOrder`, `PurchaseOrderItem` models
- [ ] **S6-T6** Migrations
- [ ] **S6-T7** `warehouse.services.stock` — `adjust()`, `consume()`, `restock()` (all writes go through here)
- [ ] **S6-T8** `WarehouseViewSet` + `WarehouseStaffViewSet`
- [ ] **S6-T9** `WarehouseInventoryViewSet`, `InventoryAdjustView`, `InventoryBulkUpdateView`
- [ ] **S6-T10** `StockMovementViewSet` — read-only log, filterable by variant/date
- [ ] **S6-T11** `StockTransferViewSet` + `approve` / `complete` actions
- [ ] **S6-T12** `PurchaseOrderViewSet` + `PurchaseOrderReceiveView`
- [ ] **S6-T13** `LowStockView` + `VariantAvailabilityView` (public)
- [ ] **S6-T14** `ScopedToWarehouseMixin`
- [ ] **S6-T15** Wire all Sprint 6 URLs

**S6 Status: ⏳ Pending**

---

## 🔒 Sprint 7 — Reservations, Allocation & Smart Routing

> Models: `InventoryReservation`

### Tasks

- [ ] **S7-T1** `InventoryReservation` model — HELD/COMMITTED/RELEASED/EXPIRED, 15-min TTL
- [ ] **S7-T2** Migrations
- [ ] **S7-T3** `warehouse.services.allocation.preview()` — Haversine routing (pure fn, no writes)
- [ ] **S7-T4** `reserve()`, `commit()`, `release()` internal service functions
- [ ] **S7-T5** `AllocationPreviewView (APIView.post)`
- [ ] **S7-T6** `ReservationSweeperTask` — Celery beat every 60s, releases expired HELD rows
- [ ] **S7-T7** `AdminInventoryReservationViewSet` — debug/support list
- [ ] **S7-T8** Wire Sprint 7 URLs

**S7 Status: ⏳ Pending**

---

## 🛒 Sprint 8 — Cart, Pricing & Promotions

> Models: `Cart`, `CartItem`, `Coupon`, `CouponUsage`, `TaxRate`, `TaxRule`

### Tasks

- [ ] **S8-T1** Create `cart_and_pricing` app
- [ ] **S8-T2** `Cart` (guest session_key + user FK), `CartItem` (price_snapshot) models
- [ ] **S8-T3** `Coupon`, `CouponUsage` models — scoped, usage limits
- [ ] **S8-T4** `TaxRate`, `TaxRule` models
- [ ] **S8-T5** Migrations
- [ ] **S8-T6** `pricing.calculate()` service — subtotal, coupon discount, tax, shipping total
- [ ] **S8-T7** `CartView` — get-or-create by session/user
- [ ] **S8-T8** `CartItemViewSet` — create/update/destroy, cart-owner check
- [ ] **S8-T9** `CartMergeView` — merge guest → auth cart post-login
- [ ] **S8-T10** `CartApplyCouponView` + `CartRemoveCouponView`
- [ ] **S8-T11** `CartSummaryView` + `CartValidateView` (price_snapshot staleness + stock)
- [ ] **S8-T12** `CouponViewSet` (public active) + `CouponValidateView` + `AdminCouponViewSet`
- [ ] **S8-T13** `TaxQuoteView`
- [ ] **S8-T14** Wire all Sprint 8 URLs

**S8 Status: ⏳ Pending**

---

## 🚚 Sprint 9 — Shipping Rates & Packing

> Models: `Carrier`, `CarrierCredential`, `ShippingZone`, `ShippingRateCard`, `RateQuote`

### Tasks

- [ ] **S9-T1** Create `shipping` app
- [ ] **S9-T2** `Carrier`, `CarrierCredential` (encrypted) models
- [ ] **S9-T3** `ShippingZone`, `ShippingRateCard`, `RateQuote` models
- [ ] **S9-T4** Migrations
- [ ] **S9-T5** `shipping.services.rates.get_quotes()` — fan-out to EasyPost/Shippo (2s timeout, `concurrent.futures`) + flat-rate fallback
- [ ] **S9-T6** `CarrierViewSet` — public list
- [ ] **S9-T7** `AdminCarrierCredentialViewSet`
- [ ] **S9-T8** `CheckoutRatesView` — fan-out + persist `RateQuote` rows
- [ ] **S9-T9** `ShippingRateCardViewSet`
- [ ] **S9-T10** Wire all Sprint 9 URLs

**S9 Status: ⏳ Pending**

---

## 📋 Sprint 10 — Orders & Checkout Orchestration

> Models: `Order`, `VendorOrder`, `OrderItem`, `OrderStatusHistory`, `Cancellation`, `Invoice`, `IdempotencyKey`, `OutboxEvent`

### Tasks

- [ ] **S10-T1** Create `orders` app
- [ ] **S10-T2** `Order`, `VendorOrder`, `OrderItem` models with status FSMs
- [ ] **S10-T3** `OrderStatusHistory`, `Cancellation`, `Invoice` models
- [ ] **S10-T4** `IdempotencyKey`, `OutboxEvent` models
- [ ] **S10-T5** Migrations
- [ ] **S10-T6** `PlaceOrderView` — full orchestration (idempotency → validate → rate quote → price → allocate → reserve → create Order tree → PaymentAttempt → OutboxEvent)
- [ ] **S10-T7** `OrderViewSet` — customer list/retrieve (owner-scoped)
- [ ] **S10-T8** `OrderCancelView` + `OrderItemCancelView`
- [ ] **S10-T9** `InvoiceView` — PDF URL (Celery-generated post-order)
- [ ] **S10-T10** `OrderTrackView` — public guest lookup by order_number + email/phone
- [ ] **S10-T11** `VendorMyOrdersViewSet` — VendorOrder rows scoped to vendor
- [ ] **S10-T12** `WarehouseOrdersViewSet` — OrderItems allocated to warehouse (picking queue)
- [ ] **S10-T13** `AdminOrderViewSet`
- [ ] **S10-T14** Wire all Sprint 10 URLs

**S10 Status: ⏳ Pending**

---

## 💳 Sprint 11 — Online Payments & Webhooks

> Models: `Transaction`, `PaymentAttempt`, `SavedCard`, `WebhookEvent`

### Tasks

- [ ] **S11-T1** Create `payments` app
- [ ] **S11-T2** `PaymentAttempt`, `Transaction`, `SavedCard`, `WebhookEvent` models
- [ ] **S11-T3** Migrations
- [ ] **S11-T4** `PaymentMethodsView` — list SavedCards + available gateways
- [ ] **S11-T5** `StripeCreatePaymentIntentView` + `StripeConfirmPaymentView`
- [ ] **S11-T6** `StripeWebhookView` — verify sig → store raw → 200 → Celery async → dedupe
- [ ] **S11-T7** Stripe webhook handler: `confirm_payment()` → commit reservations → Order.status=confirmed
- [ ] **S11-T8** `AuthorizeNetChargeView` + `AuthorizeNetWebhookView`
- [ ] **S11-T9** `SavedCardViewSet` — list/destroy
- [ ] **S11-T10** `AdminTransactionViewSet` + `AdminWebhookReplayView`
- [ ] **S11-T11** Wire all Sprint 11 URLs

**S11 Status: ⏳ Pending**

---

## 💰 Sprint 12 — Ledger, Escrow, Wallet & COD

> Models: `LedgerAccount`, `LedgerEntry`, `EscrowHold`, `CODCollection`

### Tasks

- [ ] **S12-T1** `LedgerAccount`, `LedgerEntry` (append-only, immutable) in `accounts` app
- [ ] **S12-T2** `EscrowHold` (OneToOne → VendorOrder) model
- [ ] **S12-T3** `CODCollection` model
- [ ] **S12-T4** Migrations
- [ ] **S12-T5** `payments.services.ledger.post()` — double-entry, asserts group sums to zero
- [ ] **S12-T6** `payments.services.escrow` — `create_hold()`, `schedule_release()`, `release_job()` Celery beat
- [ ] **S12-T7** `WalletBalanceView` + `WalletTransactionsView`
- [ ] **S12-T8** `VendorEscrowBalanceView`
- [ ] **S12-T9** `CODConfirmView` + `CODCollectView` (OTP verify → ledger post → status transition)
- [ ] **S12-T10** `AdminLedgerViewSet` + `AdminLedgerReconciliationView` + nightly Celery job
- [ ] **S12-T11** Wire all Sprint 12 URLs

**S12 Status: ⏳ Pending**

---

## 📬 Sprint 13 — Shipments, Labels & Tracking

> Models: `Shipment`, `ShipmentPackage`, `ShipmentItem`, `ShipmentTrackingEvent`

### Tasks

- [ ] **S13-T1** `Shipment`, `ShipmentPackage`, `ShipmentItem` models
- [ ] **S13-T2** `ShipmentTrackingEvent` (append-only) model
- [ ] **S13-T3** Migrations
- [ ] **S13-T4** `ShipmentViewSet` — vendor/warehouse create + list/retrieve
- [ ] **S13-T5** `ShipmentLabelView` — redeem RateQuote → purchase label OR self-ship manual path
- [ ] **S13-T6** `ShipmentCancelView` — void label if pre-pickup
- [ ] **S13-T7** `ShipmentTrackView` — public by tracking_number
- [ ] **S13-T8** `CarrierWebhookView` — store-raw → 200 → async → dedupe
- [ ] **S13-T9** Webhook cascade: delivered → OrderItem → VendorOrder → Order → escrow.schedule_release()
- [ ] **S13-T10** `ShipmentTrackingPollTask` — Celery beat backfill
- [ ] **S13-T11** `VendorMyShipmentsViewSet`
- [ ] **S13-T12** `warehouse.services.stock.consume_reservation()` — decrement on_hand + StockMovement
- [ ] **S13-T13** Wire all Sprint 13 URLs

**S13 Status: ⏳ Pending**

---

## ↩️ Sprint 14 — Returns, Refunds, Reviews & Q&A

> Models: `ReturnRequest`, `ReturnShipment`, `Refund`, `Review`, `ReviewMedia`, `ReviewReply`, `ProductQuestion`, `ProductAnswer`

### Tasks

- [ ] **S14-T1** `ReturnRequest (RMA)`, `ReturnShipment` models
- [ ] **S14-T2** `Refund` model — method FSM, ledger_entry_group_id
- [ ] **S14-T3** `Review`, `ReviewMedia`, `ReviewReply` models
- [ ] **S14-T4** `ProductQuestion`, `ProductAnswer` models
- [ ] **S14-T5** Migrations
- [ ] **S14-T6** `ReturnRequestCreateView` — enforces VendorPolicy.return_window_days
- [ ] **S14-T7** `ReturnRequestViewSet` — list/retrieve (owner or vendor)
- [ ] **S14-T8** `ReturnDecisionView` — approve (generate ReturnShipment label + freeze escrow) / reject
- [ ] **S14-T9** `ReturnReceiveView` — restockable → StockMovement(return_restock)
- [ ] **S14-T10** `InstantRefundView` — wallet-path, bypass physical return
- [ ] **S14-T11** `OrderRefundView` — manual admin refund, amount validation
- [ ] **S14-T12** `AdminRefundViewSet`
- [ ] **S14-T13** `ProductReviewViewSet` — public read / owner write (validate delivered order_item)
- [ ] **S14-T14** `ReviewReplyView` — vendor staff only, one per review
- [ ] **S14-T15** `AdminReviewModerationView`
- [ ] **S14-T16** `ProductQuestionViewSet` + `ProductAnswerView`
- [ ] **S14-T17** Celery task — rating aggregation on review approval
- [ ] **S14-T18** Wire all Sprint 14 URLs

**S14 Status: ⏳ Pending**

---

## 📈 Sprint 15 — Payouts, Reconciliation & Admin Reporting

> Models: `VendorPayout`, `PayoutLineItem`, `PayoutAdjustment`

### Tasks

- [ ] **S15-T1** `VendorPayout`, `PayoutLineItem`, `PayoutAdjustment` models
- [ ] **S15-T2** Migrations
- [ ] **S15-T3** `payouts.services.run_payout_batch()` — idempotent, keyed vendor+period
- [ ] **S15-T4** `EscrowReleaseJob` — Celery beat, idempotent past-due release
- [ ] **S15-T5** `VendorMyPayoutsViewSet` — list/retrieve
- [ ] **S15-T6** `VendorAnalyticsView` — revenue_by_day, top_products, order_count, return_rate
- [ ] **S15-T7** `AdminPayoutProcessView` — enqueue payout batch
- [ ] **S15-T8** `AdminDashboardStatsView` — nightly rollup tables
- [ ] **S15-T9** `AdminReportViewSet` — sales / inventory / vendor-performance
- [ ] **S15-T10** `AdminExportView` + `AdminExportStatusView` — CSV/XLSX Celery export job
- [ ] **S15-T11** Wire all Sprint 15 URLs

**S15 Status: ⏳ Pending**

---

## 🚀 Sprint 16 — Launch Hardening

### Tasks

- [ ] **S16-T1** `ScopedRateThrottle` per group — auth, checkout, search, webhook-ingest
- [ ] **S16-T2** Redis caching — ProductSearchView, CategoryViewSet, VariantAvailability, CheckoutRates (invalidation signals)
- [ ] **S16-T3** `django-silk` — staging only
- [ ] **S16-T4** Monitoring endpoints — `/admin/monitoring/webhook-backlog/`, `/ledger-drift/`, `/inventory-drift/`, `/payout-failures/`
- [ ] **S16-T5** `AdminSettingViewSet` — feature flag kill switches (`gateway.stripe.enabled`, `carrier.dhl.enabled`, `cod.enabled`)
- [ ] **S16-T6** Final OpenAPI schema review + Swagger UI polish
- [ ] **S16-T7** Security audit — CORS, CSRF, secret rotation, encryption-at-rest
- [ ] **S16-T8** Load test — checkout, search, webhook ingest

**S16 Status: ⏳ Pending**

---

## 📁 Target Project Structure

```
server/
├── venv/                        ← Python venv (gitignored)
├── config/
│   ├── __init__.py
│   ├── celery_app.py
│   ├── urls.py
│   └── settings/
│       ├── base.py
│       ├── dev.py
│       └── prod.py
├── core/                        ← BaseModel, AuditLog, Setting, middleware
├── accounts/                    ← User, Address, OTP, Social, LedgerAccount/Entry
├── vendors/                     ← Vendor, Staff, Docs, BankAccount, Policy, Commission, Payouts
├── catalog/                     ← Category(MPTT), Brand, Product, Variant, Attributes, Review, Q&A
├── warehouse/                   ← Warehouse, Staff, Inventory, StockMovement, Transfer, PO, Reservation
├── cart_and_pricing/            ← Cart, CartItem, Coupon, Tax
├── orders/                      ← Order, VendorOrder, OrderItem, Cancellation, Invoice, Outbox
├── payments/                    ← PaymentAttempt, Transaction, SavedCard, Webhook, Escrow, COD, Refund
├── shipping/                    ← Carrier, RateQuote, Shipment, Tracking, Returns
├── notifications/               ← Notification, Template, Preference
├── manage.py
├── requirements.txt
├── docker-compose.yml
├── .env.example
└── TASKS.md                     ← ← ← this file
```

---

## 🔧 Key ADR Decisions

| ADR | Decision |
|-----|----------|
| ADR-01 | Stripe Connect for vendor payouts |
| ADR-05 | Guest checkout supported (session_key) |
| ADR-07 | PostgreSQL full-text search + GIN index |
| ADR-08 | Single currency USD (configurable via Setting) |
| ADR-09 | 7-day default escrow, per-VendorPolicy override |
| ADR-11 | `null` vendor FK on Warehouse = platform-owned |
| — | No `django-guardian`; coarse role + membership-table scoping only |
| — | All business logic in `app/services.py`; views validate → call → serialize |
| — | Double-entry ledger; every `post()` asserts balanced group before commit |
| — | Cursor pagination on all list endpoints (default 20, max 100) |
| — | Idempotency-Key header on all financial POST endpoints (24h TTL) |

---

*Last updated: **Sprint 0 ✅ Complete · Sprint 1 ⏳ Next** · 2026-09-04*
