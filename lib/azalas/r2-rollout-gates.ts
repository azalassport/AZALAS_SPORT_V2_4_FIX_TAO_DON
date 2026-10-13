/**
 * R2 preview gates based on the live read-only RPC audit (13/10/2026).
 * Do not enable any of these until the corresponding RPC is installed,
 * checked for R2 compatibility and verified against a test dataset.
 * Fabric is already enabled through its own verified endpoint.
 */
export const R2_PATTERN_SLIP_READY = false;
export const R2_PRODUCT_LINK_READY = false;
export const R2_AVATAR_PROFILE_READY = false;

export const R2_SQL_BLOCKED_MESSAGE = "Chức năng đang chờ cài đặt/kiểm tra SQL tương thích R2. Không có dữ liệu nào được lưu; vui lòng liên hệ OWNER.";
