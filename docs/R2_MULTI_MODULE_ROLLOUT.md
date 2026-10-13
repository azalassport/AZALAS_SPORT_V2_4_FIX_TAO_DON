# AZALAS SPORT — R2 multi-module rollout (PREVIEW ONLY)

## Confirmed previously
- Fabric invoice uploads to private R2 bucket `azalas-images`; existing Supabase operations untouched.
- R2 write/read/delete roundtrip verified in Cloudflare Preview.
- Fabric RPC `az_supply_save_fabric_batch` is available in the linked database.

## New Preview-only changes (not merged to main)
- `app/api/azalas/media/route.ts`: authenticated R2 upload/view for scopes `pattern`, `product`, `avatar`, `supply`, `return`.
- `lib/azalas/media-client.ts`: new R2 upload and legacy Supabase signed URL helpers.
- **Rập:** Hàng nhà, Khách đặt, Danh mục + Tiến độ image URLs.
- **Kho hàng:** new product images, old Supabase images still readable.
- **Phụ liệu / In:** new PDF proof to R2, older Supabase PDF and Fabric R2 still readable.
- **Hàng trả:** direct receipt image upload and photo viewing converted in Preview (RPC SQL validation still to check).
- **Tài khoản:** new avatar upload and mixed image viewing; old avatars not deleted.

## Protected, intentionally untouched in this iteration
1. Tạo đơn — Supabase image uploads preserved.
2. Soạn đơn — Supabase image uploads preserved.
3. Hóa đơn — Supabase image uploads preserved.
4. Kho ảnh — Supabase image reads preserved.

## WARNING: shared production database
Preview and Production point to the same Supabase project. **Do not test new product / avatar / return / pattern writes using real data before both**:
1. TypeScript + Vinext build verified; and
2. SQL validators for the currently deployed RPCs reviewed and adapted if necessary.

Some RPCs verify `storage.objects`, the old path format, or the image's upload time. An R2 object will not pass these checks until a targeted, audited migration is applied. The SQL auditor `sql/R2_MULTI_MODULE_RPC_AUDIT_READ_ONLY.sql.txt` only reads definitions and never modifies data. Request migration patches after fetching real definitions; **do not overwrite live RPCs from old repository SQL**.

## Compatibility rule
Paths beginning `r2:` are read through the authenticated R2 proxy. All other paths continue using their original private Supabase Storage bucket. No old files are deleted or migrated.

## Verification order
1. `npm run typecheck`
2. `npm run build:vinext`
3. `npx cf previews deploy azalas-fabric-r2`
4. Open Preview; browse existing Supabase media in each modified module.
5. Run the SQL auditor; **do not** create mock financial/stock records in the live database.
6. Apply verified, additive migrations only after checking each live RPC.
7. Test each newly changed module using a separate test database or a deliberately approved real transaction.
8. Merge to `main` / deploy Production only after all checks are green.

### Important
- R2 objects are intentionally not auto-deleted on a failed RPC because they may be linked to business data. Manual orphan cleanup can be developed once schema is finalized.
- The R2 API does not replace or modify live invoice/order/image-library APIs.

## Live Supabase audit — 13/10/2026

From read-only SQL result supplied by owner:

| Requested function | Found in live public schema |
|---|---|
| az_return_finalize_direct(bigint,text) | YES — verifies storage.objects and photo freshness |
| az_pattern_house_entry_create | NO |
| az_pattern_customer_entry_create | NO |
| az_stock_set_image | NO |
| az_update_my_profile | NO |

**Safety correction applied:** direct return receipt image upload stays on the original private Supabase bucket until a trusted, server-side R2 proof can preserve all anti-replay, freshness, debt-lock and duplicate-finalize protections. No production financial SQL is replaced.

**BLOCKER:** Missing RPCs must be restored using verified business SQL based on live schema, not guessed from frontend calls or old repository migrations. Do not test uploads that depend on them: currently the frontend may upload a new R2 object before the related missing RPC rejects linkage, leaving an orphan. Existing order, packing, invoice and photo-library workflows remain unchanged.

**Additional hardening:** generic R2 viewing is now allowed only for the object's uploader or authorized users with a corresponding database link. File possession alone does not grant access.

**Next action:** run `npm run typecheck` and `npm run build:vinext` locally and provide output. Then inspect missing RPC dependencies using read-only SQL, restore one verified RPC at a time with backward compatibility. Do not execute actual stock/returns/pattern financial operations on Preview while sharing a production database.
