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
| 3 | Vendors, KYC, Staff, Commission | 15 | ✅ Complete | ██████████ 100% |
| 4 | Catalog Core & Moderation | 12 | ✅ Complete | ██████████ 100% |
| 5 | Variants, Attributes & Search | 9 | ✅ Complete | ██████████ 100% |
| 6 | Warehouse & Inventory Core | 15 | ✅ Complete | ██████████ 100% |
| 7 | Reservations, Allocation & Smart Routing | 2 | ✅ Complete | ██████████ 100% |
| 8 | Cart, Pricing & Promotions | 12 | ✅ Complete | ██████████ 100% |
| 9 | Shipping Rates & Packing | 4 | ✅ Complete | ██████████ 100% |
| 10 | Orders & Checkout Orchestration | 12 | ✅ Complete | ██████████ 100% |
| 11 | Online Payments & Webhooks | 10 | ✅ Complete | ██████████ 100% |
| 12 | Ledger, Escrow, Wallet & COD | 7 | ✅ Complete | ██████████ 100% |
| 13 | Shipments, Labels & Tracking | 8 | ✅ Complete | ██████████ 100% |
| 14 | Returns, Refunds, Reviews & Q&A | 12 | ✅ Complete | ██████████ 100% |
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

**S2 Status: ✅ Complete** — 20 total unit tests passing · OpenAPI schema 0 errors · Migrations applied · Frontend integration complete (Auth, Session, Account Portal, Addresses, Avatar upload, Notifications, Customer Management)

---

## 🏪 Sprint 3 — Vendors, KYC, Staff, Commission

> Models: `Vendor`, `VendorStaff`, `VendorDocument`, `VendorBankAccount`, `VendorPolicy`, `CommissionRule`, `VendorPayout`, `PayoutLineItem`, `PayoutAdjustment`

### Tasks

- [x] **S3-T1** Create `vendors` app
- [x] **S3-T2** `Vendor` model — status FSM, slug, rating denorm
- [x] **S3-T3** `VendorStaff`, `VendorDocument`, `VendorBankAccount` (encrypted, masked) models
- [x] **S3-T4** `VendorPolicy` (OneToOne), `CommissionRule` models
- [x] **S3-T5** `VendorPayout`, `PayoutLineItem`, `PayoutAdjustment` models — deferred to Sprint 15 (per spec)
- [x] **S3-T6** Migrations (`vendors/migrations/0001_initial.py` applied; `core` migration for AuditLog.action max_length fix)
- [x] **S3-T7** `VendorApplicationView` + `VendorMeViewSet`
- [x] **S3-T8** `VendorStorefrontView` — public, lookup by slug
- [x] **S3-T9** `VendorStaffViewSet`, `VendorBankAccountViewSet`, `VendorDocumentViewSet`
- [x] **S3-T10** `VendorPolicyView (RetrieveUpdateAPIView)`
- [x] **S3-T11** `AdminVendorViewSet` + `AdminVendorStatusUpdateView` (AuditLog + Celery Stripe Connect task stub)
- [x] **S3-T12** `AdminVendorDocumentReviewView`
- [x] **S3-T13** `AdminCommissionRuleViewSet`
- [x] **S3-T14** `ScopedToVendorMixin` — queryset scoped to vendor from VendorStaff membership
- [x] **S3-T15** Wire all Sprint 3 URLs

**S3 Status: ✅ Complete** — 27 unit tests passing · OpenAPI schema 0 errors · Migrations applied · 15 endpoints live

---

## 📦 Sprint 4 — Catalog Core & Moderation

> Models: `Category` (MPTT), `Brand`, `Product`, `ProductImage`, `ProductTag`

### Tasks

- [x] **S4-T1** Create `catalog` app
- [x] **S4-T2** `Category` model with `django-mptt` tree structure
- [x] **S4-T3** `Brand`, `Product` (search_vector GIN index), `ProductImage`, `ProductTag` models
- [x] **S4-T4** Migrations (incl. GIN index on search_vector)
- [x] **S4-T5** `CategoryViewSet` (public read) + `AdminCategoryViewSet` (admin CRUD)
- [x] **S4-T6** `BrandViewSet` (public read) + `AdminBrandViewSet` (admin CRUD)
- [x] **S4-T7** `ProductViewSet` — public approved list/detail
- [x] **S4-T8** `VendorMyProductsViewSet` — vendor's own products (all statuses)
- [x] **S4-T9** `AdminProductModerationView` — approve/reject (AuditLog + vendor Notification)
- [x] **S4-T10** `VendorProductBulkImportView` — CSV/XLSX → Celery task → `job_id`
- [x] **S4-T11** `BulkImportStatusView` — poll job status + per-row report
- [x] **S4-T12** Wire all Sprint 4 URLs

**S4 Status: ✅ Complete** — 26 unit tests passing · Admin Moderation Page & Vendor Products Tab active

---

## 🎨 Sprint 5 — Variants, Attributes & Search

> Models: `ProductAttribute`, `ProductAttributeValue`, `ProductVariant`, `ProductVariantAttribute`, `Wishlist`

### Tasks

- [x] **S5-T1** `ProductAttribute`, `ProductAttributeValue` models
- [x] **S5-T2** `ProductVariant` (SKU, price, dimensions), `ProductVariantAttribute` models
- [x] **S5-T3** `Wishlist` model
- [x] **S5-T4** Migrations
- [x] **S5-T5** `ProductVariantViewSet` — nested under product, vendor-owner write
- [x] **S5-T6** `ProductVariantGenerateView` — cartesian product of attribute-value groups (service call)
- [x] **S5-T7** `ProductAttributeViewSet` — public read / admin write
- [x] **S5-T8** `ProductSearchView` — full-text + django-filter + facets (Redis cache 60s)
- [x] **S5-T9** `ProductRelatedView` — same category, exclude self, order by rating
- [x] **S5-T10** `WishlistViewSet` — list/create/destroy, owner-scoped
- [x] **S5-T11** Wire all Sprint 5 URLs

**S5 Status: ✅ Complete** — 15 unit tests passing (88/88 suite-wide) · Cartesian matrix generator & ProductVariantsModal integrated

---

## 🏭 Sprint 6 — Warehouse & Inventory Core

> Models: `Warehouse`, `WarehouseStaff`, `Inventory`, `StockMovement`, `StockTransfer`, `StockTransferItem`, `PurchaseOrder`, `PurchaseOrderItem`

### Tasks

- [x] **S6-T1** Create `warehouse` app
- [x] **S6-T2** `Warehouse`, `WarehouseStaff` models
- [x] **S6-T3** `Inventory` model — on_hand, reserved_cache, reorder_threshold
- [x] **S6-T4** `StockMovement` (append-only), `StockTransfer`, `StockTransferItem` models
- [x] **S6-T5** `PurchaseOrder`, `PurchaseOrderItem` models
- [x] **S6-T6** Migrations
- [x] **S6-T7** `warehouse.services.stock` — `adjust()`, `consume()`, `restock()` (all writes go through here)
- [x] **S6-T8** `WarehouseViewSet` + `WarehouseStaffViewSet`
- [x] **S6-T9** `WarehouseInventoryViewSet`, `InventoryAdjustView`, `InventoryBulkUpdateView`
- [x] **S6-T10** `StockMovementViewSet` — read-only log, filterable by variant/date
- [x] **S6-T11** `StockTransferViewSet` + `approve` / `complete` actions
- [x] **S6-T12** `PurchaseOrderViewSet` + `PurchaseOrderReceiveView`
- [x] **S6-T13** `LowStockView` + `VariantAvailabilityView` (public)
- [x] **S6-T14** `ScopedToWarehouseMixin`
- [x] **S6-T15** Wire all Sprint 6 URLs

**S6 Status: ✅ Complete**


---

## 🔒 Sprint 7 — Reservations, Allocation & Smart Routing

> Models: `InventoryReservation`

### Tasks

- [x] **S7-T1** `InventoryReservation` model — HELD/COMMITTED/RELEASED/EXPIRED, 15-min TTL
- [x] **S7-T2** Migrations
- [x] **S7-T3** `warehouse.services.allocation.preview()` — Haversine routing (pure fn, no writes)
- [x] **S7-T4** `reserve()`, `commit()`, `release()` internal service functions
- [x] **S7-T5** `AllocationPreviewView (APIView.post)`
- [x] **S7-T6** `ReservationSweeperTask` — Celery beat every 60s, releases expired HELD rows
- [x] **S7-T7** `AdminInventoryReservationViewSet` — debug/support list
- [x] **S7-T8** Wire Sprint 7 URLs

**S7 Status: ✅ Complete**


---

## 🛒 Sprint 8 — Cart, Pricing & Promotions

> Models: `Cart`, `CartItem`, `Coupon`, `CouponUsage`, `TaxRate`, `TaxRule`

### Tasks

- [x] **S8-T1** Create `cart_and_pricing` app
- [x] **S8-T2** `Cart` (guest session_key + user FK), `CartItem` (price_snapshot) models
- [x] **S8-T3** `Coupon`, `CouponUsage` models — scoped, usage limits
- [x] **S8-T4** `TaxRate`, `TaxRule` models
- [x] **S8-T5** Migrations
- [x] **S8-T6** `pricing.calculate()` service — subtotal, coupon discount, tax, shipping total
- [x] **S8-T7** `CartView` — get-or-create by session/user
- [x] **S8-T8** `CartItemViewSet` — create/update/destroy, cart-owner check
- [x] **S8-T9** `CartMergeView` — merge guest → auth cart post-login
- [x] **S8-T10** `CartApplyCouponView` + `CartRemoveCouponView`
- [x] **S8-T11** `CartSummaryView` + `CartValidateView` (price_snapshot staleness + stock)
- [x] **S8-T12** `CouponViewSet` (public active) + `CouponValidateView` + `AdminCouponViewSet`
- [x] **S8-T13** `TaxQuoteView`
- [x] **S8-T14** Wire all Sprint 8 URLs

**S8 Status: ✅ Complete** — 19/19 unit tests passing · Frontend CartPage & API integrated

---

## 🚚 Sprint 9 — Shipping Rates & Packing

> Models: `Carrier`, `CarrierCredential`, `ShippingZone`, `ShippingRateCard`, `RateQuote`

### Tasks

- [x] **S9-T1** Create `shipping` app
- [x] **S9-T2** `Carrier`, `CarrierCredential` (encrypted) models
- [x] **S9-T3** `ShippingZone`, `ShippingRateCard`, `RateQuote` models
- [x] **S9-T4** Migrations
- [x] **S9-T5** `shipping.services.rates.get_quotes()` — fan-out to EasyPost/Shippo (2s timeout, `concurrent.futures`) + flat-rate fallback
- [x] **S9-T6** `CarrierViewSet` — public list
- [x] **S9-T7** `AdminCarrierCredentialViewSet`
- [x] **S9-T8** `CheckoutRatesView` — fan-out + persist `RateQuote` rows
- [x] **S9-T9** `ShippingRateCardViewSet`
- [x] **S9-T10** Wire all Sprint 9 URLs

**S9 Status: ✅ Complete** — 8/8 shipping unit tests passing · 140/140 project tests passing · Frontend CartPage & API integrated

---

## 📋 Sprint 10 — Orders & Checkout Orchestration

> Models: `Order`, `VendorOrder`, `OrderItem`, `OrderStatusHistory`, `Cancellation`, `Invoice`, `IdempotencyKey`, `OutboxEvent`

### Tasks

- [x] **S10-T1** Create `orders` app
- [x] **S10-T2** `Order`, `VendorOrder`, `OrderItem` models with status FSMs
- [x] **S10-T3** `OrderStatusHistory`, `Cancellation`, `Invoice` models
- [x] **S10-T4** `IdempotencyKey`, `OutboxEvent` models
- [x] **S10-T5** Migrations
- [x] **S10-T6** `PlaceOrderView` — full orchestration (idempotency → validate → rate quote → price → allocate → reserve → create Order tree → PaymentAttempt → OutboxEvent)
- [x] **S10-T7** `OrderViewSet` — customer list/retrieve (owner-scoped)
- [x] **S10-T8** `OrderCancelView` + `OrderItemCancelView`
- [x] **S10-T9** `InvoiceView` — PDF URL (Celery-generated post-order)
- [x] **S10-T10** `OrderTrackView` — public guest lookup by order_number + email/phone
- [x] **S10-T11** `VendorMyOrdersViewSet` — VendorOrder rows scoped to vendor
- [x] **S10-T12** `WarehouseOrdersViewSet` — OrderItems allocated to warehouse (picking queue)
- [x] **S10-T13** `AdminOrderViewSet`
- [x] **S10-T14** Wire all Sprint 10 URLs

**S10 Status: ✅ Complete** — 6/6 orders unit tests passing · 146/146 project tests passing · Client OrderAPI, CartPage checkout flow, & AccountPage order history integrated

---

## 💳 Sprint 11 — Online Payments & Webhooks

> Models: `Transaction`, `PaymentAttempt`, `SavedCard`, `WebhookEvent`

### Tasks

- [x] **S11-T1** Create `payments` app
- [x] **S11-T2** `PaymentAttempt`, `Transaction`, `SavedCard`, `WebhookEvent` models
- [x] **S11-T3** Migrations
- [x] **S11-T4** `PaymentMethodsView` — list SavedCards + available gateways
- [x] **S11-T5** `StripeCreatePaymentIntentView` + `StripeConfirmPaymentView`
- [x] **S11-T6** `StripeWebhookView` — verify sig → store raw → 200 → Celery async → dedupe
- [x] **S11-T7** Stripe webhook handler: `confirm_payment()` → commit reservations → Order.status=confirmed
- [x] **S11-T8** `AuthorizeNetChargeView` + `AuthorizeNetWebhookView`
- [x] **S11-T9** `SavedCardViewSet` — list/destroy
- [x] **S11-T10** `AdminTransactionViewSet` + `AdminWebhookReplayView`
- [x] **S11-T11** Wire all Sprint 11 URLs

**S11 Status: ✅ Complete** — 7/7 payments unit tests passing · 153/153 project tests passing · Frontend PaymentAPI & AccountPage saved cards integrated

---

## 💰 Sprint 12 — Ledger, Escrow, Wallet & COD

> Models: `LedgerAccount`, `LedgerEntry`, `EscrowHold`, `CODCollection`

### Tasks

- [x] **S12-T1** `LedgerAccount`, `LedgerEntry` (append-only, immutable) in `accounts` app
- [x] **S12-T2** `EscrowHold` (OneToOne → VendorOrder) model
- [x] **S12-T3** `CODCollection` model
- [x] **S12-T4** Migrations
- [x] **S12-T5** `payments.services.ledger.post()` — double-entry, asserts group sums to zero
- [x] **S12-T6** `payments.services.escrow` — `create_hold()`, `schedule_release()`, `release_job()` Celery beat
- [x] **S12-T7** `WalletBalanceView` + `WalletTransactionsView`
- [x] **S12-T8** `VendorEscrowBalanceView`
- [x] **S12-T9** `CODConfirmView` + `CODCollectView` (OTP verify → ledger post → status transition)
- [x] **S12-T10** `AdminLedgerViewSet` + `AdminLedgerReconciliationView` + nightly Celery job
- [x] **S12-T11** Wire all Sprint 12 URLs

**S12 Status: ✅ Complete** — 13/13 payments unit tests passing · 159/159 project tests passing · Frontend PaymentAPI & AccountPage wallet integrated

---

## 📬 Sprint 13 — Shipments, Labels & Tracking

> Models: `Shipment`, `ShipmentPackage`, `ShipmentItem`, `ShipmentTrackingEvent`

### Tasks

- [x] **S13-T1** `Shipment`, `ShipmentPackage`, `ShipmentItem` models
- [x] **S13-T2** `ShipmentTrackingEvent` (append-only) model
- [x] **S13-T3** Migrations
- [x] **S13-T4** `ShipmentViewSet` — vendor/warehouse create + list/retrieve
- [x] **S13-T5** `ShipmentLabelView` — redeem RateQuote → purchase label OR self-ship manual path
- [x] **S13-T6** `ShipmentCancelView` — void label if pre-pickup
- [x] **S13-T7** `ShipmentTrackView` — public by tracking_number
- [x] **S13-T8** `CarrierWebhookView` — store-raw → 200 → async → dedupe
- [x] **S13-T9** Webhook cascade: delivered → OrderItem → VendorOrder → Order → escrow.schedule_release()
- [x] **S13-T10** `ShipmentTrackingPollTask` — Celery beat backfill
- [x] **S13-T11** `VendorMyShipmentsViewSet`
- [x] **S13-T12** `warehouse.services.stock.consume_reservation()` — decrement on_hand + StockMovement
- [x] **S13-T13** Wire all Sprint 13 URLs

**S13 Status: ✅ Complete** — 15/15 shipping unit tests passing · 166/166 project tests passing · Frontend ShippingAPI integrated

---

## ↩️ Sprint 14 — Returns, Refunds, Reviews & Q&A

> Models: `ReturnRequest`, `ReturnShipment`, `Refund`, `Review`, `ReviewMedia`, `ReviewReply`, `ProductQuestion`, `ProductAnswer`

### Tasks

- [x] **S14-T1** `ReturnRequest (RMA)`, `ReturnShipment` models
- [x] **S14-T2** `Refund` model — method FSM, ledger_entry_group_id
- [x] **S14-T3** `Review`, `ReviewMedia`, `ReviewReply` models
- [x] **S14-T4** `ProductQuestion`, `ProductAnswer` models
- [x] **S14-T5** Migrations
- [x] **S14-T6** `ReturnRequestCreateView` — enforces VendorPolicy.return_window_days
- [x] **S14-T7** `ReturnRequestViewSet` — list/retrieve (owner or vendor)
- [x] **S14-T8** `ReturnDecisionView` — approve (generate ReturnShipment label + freeze escrow) / reject
- [x] **S14-T9** `ReturnReceiveView` — restockable → StockMovement(return_restock)
- [x] **S14-T10** `InstantRefundView` — wallet-path, bypass physical return
- [x] **S14-T11** `OrderRefundView` — manual admin refund, amount validation
- [x] **S14-T12** `AdminRefundViewSet`
- [x] **S14-T13** `ProductReviewViewSet` — public read / owner write (validate delivered order_item)
- [x] **S14-T14** `ReviewReplyView` — vendor staff only, one per review
- [x] **S14-T15** `AdminReviewModerationView`
- [x] **S14-T16** `ProductQuestionViewSet` + `ProductAnswerView`
- [x] **S14-T17** Celery task — rating aggregation on review approval
- [x] **S14-T18** Wire all Sprint 14 URLs

**S14 Status: ✅ Complete** — 18/18 tasks done · 184/184 total project tests passing · Frontend API client integrated & TypeScript verified clean

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
