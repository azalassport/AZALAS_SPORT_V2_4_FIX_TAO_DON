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
