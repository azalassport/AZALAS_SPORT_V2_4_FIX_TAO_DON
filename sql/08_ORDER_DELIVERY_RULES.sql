-- AZALAS V2.4: QUY TAC NGAY GIAO TAI DATABASE.
-- CHI CHAY tren project azalas-test da co database V2.4.
-- KHONG RESET, KHONG XOA HOAC SUA DU LIEU DON DA TAO.
-- Don THUONG: tu dong lay ngay hien tai Asia/Ho_Chi_Minh.
-- KHACH_DAT: bat buoc nguoi tao truyen ngay giao cu the.
BEGIN;
CREATE OR REPLACE FUNCTION public.az_order_delivery_guard_v24()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $guard$
BEGIN
  IF NEW.order_type = 'THUONG' THEN
    NEW.delivery_date := (clock_timestamp() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  ELSIF NEW.order_type = 'KHACH_DAT' AND NEW.delivery_date IS NULL THEN
    RAISE EXCEPTION 'Khach dat bat buoc chon ngay giao hang';
  END IF;
  RETURN NEW;
END;
$guard$;
DROP TRIGGER IF EXISTS az_order_delivery_guard_insert_v24 ON public.order_groups;
CREATE TRIGGER az_order_delivery_guard_insert_v24
BEFORE INSERT ON public.order_groups
FOR EACH ROW EXECUTE FUNCTION public.az_order_delivery_guard_v24();
COMMIT;
