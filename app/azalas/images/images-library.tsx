"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, Search, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { norm, dt } from "@/lib/azalas/format";
import { ImageViewer, Loading, Msg } from "@/components/ui";

type Group = {
  id: number;
  root_code: string;
  customer_name: string;
  order_type: string;
  created_at: string;
  creator_note: string | null;
};

type Img = {
  id: number;
  group_id: number;
  storage_path: string;
};

const VN_TIME_ZONE = "Asia/Ho_Chi_Minh";

function getDateKey(value: string) {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: VN_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(value));

    const year =
      parts.find((part) => part.type === "year")?.value || "";
    const month =
      parts.find((part) => part.type === "month")?.value || "";
    const day =
      parts.find((part) => part.type === "day")?.value || "";

    return `${year}-${month}-${day}`;
  } catch {
    return "";
  }
}

function displayDateFromKey(key: string) {
  const [year, month, day] = key.split("-");

  if (!year || !month || !day) return key;

  return `${Number(day)}/${Number(month)}/${year}`;
}

export default function ImagesLibrary() {
  const sb = useMemo(() => createClient(), []);

  const [groups, setGroups] = useState<Group[]>([]);
  const [images, setImages] = useState<Img[]>([]);
  const [urls, setUrls] = useState<Record<number, string>>({});

  const [search, setSearch] = useState("");
  const [selectedDate, setSelectedDate] = useState("");

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");

    const { data: g, error: e } = await sb
      .from("order_groups")
      .select(
        "id,root_code,customer_name,order_type,created_at,creator_note",
      )
      .order("created_at", { ascending: false })
      .limit(120);

    if (e) {
      setErr(e.message);
      setLoading(false);
      return;
    }

    const ids = (g || []).map((x) => x.id);

    const { data: imgs, error: ie } = ids.length
      ? await sb
          .from("order_images")
          .select("id,group_id,storage_path")
          .in("group_id", ids)
          .order("id")
      : {
          data: [] as Img[],
          error: null,
        };

    if (ie) {
      setErr(ie.message);
    }

    setGroups(
      (g || []).filter((group) =>
        (imgs || []).some(
          (image) => image.group_id === group.id,
        ),
      ) as Group[],
    );

    setImages((imgs || []) as Img[]);

    const paths = (imgs || []).map(
      (image) => image.storage_path,
    );

    if (paths.length) {
      const { data: signed, error: se } =
        await sb.storage
          .from("az-order-images")
          .createSignedUrls(paths, 3600);

      if (se) {
        setErr(se.message);
      } else {
        setUrls(
          Object.fromEntries(
            (imgs || []).map((img, index) => [
              img.id,
              signed?.[index]?.signedUrl || "",
            ]),
          ),
        );
      }
    } else {
      setUrls({});
    }

    setLoading(false);
  }, [sb]);

  useEffect(() => {
    void load();
  }, [load]);

  // SEARCH + LỌC NGÀY
  const filteredGroups = useMemo(() => {
    const keyword = norm(search);

    return groups.filter((group) => {
      const matchesSearch = norm(
        `${group.root_code} ${group.customer_name} ${
          group.creator_note || ""
        }`,
      ).includes(keyword);

      const matchesDate =
        !selectedDate ||
        getDateKey(group.created_at) === selectedDate;

      return matchesSearch && matchesDate;
    });
  }, [groups, search, selectedDate]);

  // GOM TẤT CẢ ĐƠN THEO NGÀY
  const groupsByDate = useMemo(() => {
    const map = new Map<string, Group[]>();

    filteredGroups.forEach((group) => {
      const key = getDateKey(group.created_at);

      if (!map.has(key)) {
        map.set(key, []);
      }

      map.get(key)!.push(group);
    });

    return [...map.entries()].sort(
      ([dateA], [dateB]) =>
        dateB.localeCompare(dateA),
    );
  }, [filteredGroups]);

  return (
    <div className="space-y-7">

      {/* SEARCH + CHỌN NGÀY */}
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_280px]">

        {/* SEARCH */}
        <div className="relative">
          <Search
            size={21}
            strokeWidth={2}
            className="
              pointer-events-none
              absolute
              left-4
              top-1/2
              -translate-y-1/2
              text-slate-400
            "
          />

          <input
            className="
              field
              !h-[56px]
              !rounded-2xl
              !border-blue-200
              !bg-white
              !pl-12
              !text-[16px]
              shadow-[0_7px_22px_rgba(37,99,235,0.06)]
            "
            placeholder="Tìm tên khách, mã đơn hoặc ghi chú..."
            value={search}
            onChange={(e) =>
              setSearch(e.target.value)
            }
          />
        </div>

        {/* CHỌN NGÀY */}
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">

            <CalendarDays
              size={21}
              strokeWidth={2}
              className="
                pointer-events-none
                absolute
                left-4
                top-1/2
                z-10
                -translate-y-1/2
                text-blue-600
              "
            />

            <input
              type="date"
              className="
                field
                !h-[56px]
                !rounded-2xl
                !border-blue-200
                !bg-white
                !pl-12
                !text-[15px]
                !font-bold
                text-slate-800
                shadow-[0_7px_22px_rgba(37,99,235,0.06)]
              "
              value={selectedDate}
              onChange={(e) =>
                setSelectedDate(e.target.value)
              }
            />
          </div>

          {selectedDate && (
            <button
              type="button"
              onClick={() =>
                setSelectedDate("")
              }
              title="Hiện tất cả ngày"
              className="
                flex
                h-[56px]
                w-[56px]
                shrink-0
                items-center
                justify-center
                rounded-2xl
                border
                border-slate-200
                bg-white
                text-slate-500
                shadow-sm
                transition
                hover:border-blue-200
                hover:bg-blue-50
                hover:text-blue-700
              "
            >
              <X size={20} />
            </button>
          )}
        </div>
      </div>

      <Msg error={err} />

      {loading ? (
        <Loading />
      ) : filteredGroups.length === 0 ? (
        <div className="panel muted">
          Chưa có ảnh đơn phù hợp.
          Đơn vừa tạo mà thiếu ảnh cần được
          upload bổ sung trước.
        </div>
      ) : (
        <div className="space-y-10">

          {groupsByDate.map(
            ([date, dayGroups]) => (
              <section
                key={date}
                className="space-y-5"
              >

                {/* NGÀY CĂN GIỮA */}
                <div className="
                  flex
                  items-center
                  gap-4
                ">
                  <div className="
                    h-px
                    flex-1
                    bg-gradient-to-r
                    from-transparent
                    via-blue-200
                    to-blue-300
                  " />

                  <div className="
                    min-w-[175px]
                    rounded-full
                    border
                    border-blue-200
                    bg-white
                    px-6
                    py-2.5
                    text-center
                    text-[19px]
                    font-black
                    tracking-[0.01em]
                    text-blue-950
                    shadow-sm
                  ">
                    {displayDateFromKey(date)}
                  </div>

                  <div className="
                    h-px
                    flex-1
                    bg-gradient-to-l
                    from-transparent
                    via-blue-200
                    to-blue-300
                  " />
                </div>

                {/* TOÀN BỘ ẢNH CỦA NGÀY */}
                <div className="
                  grid
                  gap-5
                  lg:grid-cols-2
                ">
                  {dayGroups.map((g) => {

                    const groupImages =
                      images
                        .filter(
                          (image) =>
                            image.group_id ===
                            g.id,
                        )
                        .map(
                          (image) =>
                            urls[image.id],
                        )
                        .filter(Boolean);

                    return (
                      <section
                        key={g.id}
                        className="
                          rounded-[22px]
                          border
                          border-slate-200
                          bg-white
                          p-5
                          shadow-[0_10px_30px_rgba(30,64,175,0.07)]
                          sm:p-6
                        "
                      >
                        <div className="
                          flex
                          items-start
                          justify-between
                          gap-4
                        ">
                          <div className="min-w-0">

                            <h2 className="
                              text-[21px]
                              font-black
                              text-slate-950
                            ">
                              {g.customer_name}
                            </h2>

                            <p className="
                              mt-1
                              text-[14px]
                              font-medium
                              text-slate-500
                            ">
                              {g.root_code}
                              {" · "}
                              {dt(g.created_at)}
                            </p>

                          </div>

                          <Link
                            className="
                              btn
                              soft
                              shrink-0
                            "
                            href="/azalas/orders"
                          >
                            Xem đơn →
                          </Link>
                        </div>

                        {g.creator_note && (
                          <p className="
                            mt-2
                            text-[15px]
                            text-slate-600
                          ">
                            {g.creator_note}
                          </p>
                        )}

                        <div className="mt-4">
                          <ImageViewer
                            urls={
                              groupImages
                            }
                            label={
                              `Ảnh đơn ${g.root_code}`
                            }
                          />
                        </div>
                      </section>
                    );
                  })}
                </div>
              </section>
            ),
          )}
        </div>
      )}
    </div>
  );
}