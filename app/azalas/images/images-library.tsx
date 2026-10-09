"use client";

import Link from "next/link";
import {
  CalendarDays,
  Eye,
  ImageIcon,
  Search,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { createClient } from "@/lib/supabase/client";
import { norm } from "@/lib/azalas/format";
import {
  ImageViewer,
  Loading,
  Msg,
} from "@/components/ui";

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

type DateSection = {
  key: string;
  label: string;
  groups: Group[];
};

function vietnamDateKey(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function vietnamDateLabel(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Không rõ ngày";
  }

  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function vietnamDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
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

    try {
      const { data: groupData, error: groupError } = await sb
        .from("order_groups")
        .select(
          "id,root_code,customer_name,order_type,created_at,creator_note",
        )
        .order("created_at", { ascending: false })
        .limit(300);

      if (groupError) {
        setErr(groupError.message);
        return;
      }

      const rawGroups = (groupData || []) as Group[];
      const ids = rawGroups.map((group) => group.id);

      const imageResult = ids.length
        ? await sb
            .from("order_images")
            .select("id,group_id,storage_path")
            .in("group_id", ids)
            .order("id")
        : {
            data: [] as Img[],
            error: null,
          };

      if (imageResult.error) {
        setErr(imageResult.error.message);
        return;
      }

      const rawImages = (imageResult.data || []) as Img[];
      const imageGroupIds = new Set(
        rawImages.map((image) => image.group_id),
      );

      setGroups(
        rawGroups.filter((group) => imageGroupIds.has(group.id)),
      );
      setImages(rawImages);

      const paths = rawImages.map((image) => image.storage_path);

      if (!paths.length) {
        setUrls({});
        return;
      }

      const { data: signed, error: signedError } = await sb.storage
        .from("az-order-images")
        .createSignedUrls(paths, 3600);

      if (signedError) {
        setErr(signedError.message);
        return;
      }

      setUrls(
        Object.fromEntries(
          rawImages.map((image, index) => [
            image.id,
            signed?.[index]?.signedUrl || "",
          ]),
        ),
      );
    } finally {
      setLoading(false);
    }
  }, [sb]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const keyword = norm(search.trim());

    return groups.filter((group) => {
      const matchesSearch =
        !keyword ||
        norm(
          [
            group.root_code,
            group.customer_name,
            group.creator_note || "",
          ].join(" "),
        ).includes(keyword);

      const matchesDate =
        !selectedDate ||
        vietnamDateKey(group.created_at) === selectedDate;

      return matchesSearch && matchesDate;
    });
  }, [groups, search, selectedDate]);

  const sections = useMemo<DateSection[]>(() => {
    const map = new Map<string, DateSection>();

    for (const group of filtered) {
      const key =
        vietnamDateKey(group.created_at) || "unknown";

      if (!map.has(key)) {
        map.set(key, {
          key,
          label:
            key === "unknown"
              ? "Không rõ ngày"
              : vietnamDateLabel(group.created_at),
          groups: [],
        });
      }

      map.get(key)!.groups.push(group);
    }

    return Array.from(map.values());
  }, [filtered]);

  const totalImages = useMemo(
    () =>
      filtered.reduce(
        (sum, group) =>
          sum +
          images.filter(
            (image) => image.group_id === group.id,
          ).length,
        0,
      ),
    [filtered, images],
  );

  return (
    <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white/95 shadow-[0_18px_48px_rgba(15,23,42,.07)]">
      <div className="border-b border-slate-100 bg-gradient-to-br from-white via-blue-50/40 to-cyan-50/50 p-4 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-[11px] font-black uppercase tracking-[0.17em] text-blue-700">
              KHO ẢNH
            </div>

            <h2 className="mt-1 text-[25px] font-black tracking-[-0.5px] text-[#0d2346] sm:text-[31px]">
              Ảnh đơn khách đặt
            </h2>

            <p className="mt-2 text-[13px] font-semibold text-slate-500 sm:text-[14px]">
              Ảnh được nhóm theo ngày, mới nhất hiển thị trước.
            </p>
          </div>

          <div className="flex gap-3">
            <div className="rounded-2xl border border-blue-200 bg-white px-4 py-3">
              <div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">
                Đơn có ảnh
              </div>
              <div className="mt-1 text-[24px] font-black text-blue-700">
                {filtered.length}
              </div>
            </div>

            <div className="rounded-2xl border border-cyan-200 bg-white px-4 py-3">
              <div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">
                Tổng ảnh
              </div>
              <div className="mt-1 text-[24px] font-black text-cyan-700">
                {totalImages}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_260px]">
          <label className="relative block">
            <Search
              className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"
              strokeWidth={2.3}
            />
            <input
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
              placeholder="Tìm tên khách, mã đơn hoặc ghi chú..."
              className="h-14 w-full rounded-2xl border border-slate-200 bg-white pl-12 pr-11 text-[15px] font-semibold text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:ring-4 focus:ring-blue-100/70"
            />

            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="Xóa tìm kiếm"
                className="absolute right-3 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </label>

          <label className="relative block">
            <CalendarDays
              className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-blue-600"
              strokeWidth={2.2}
            />
            <input
              type="date"
              value={selectedDate}
              onChange={(event) =>
                setSelectedDate(event.target.value)
              }
              className="h-14 w-full rounded-2xl border border-blue-200 bg-white pl-12 pr-4 text-[15px] font-black text-slate-700 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100/70"
            />
          </label>
        </div>

        {(search || selectedDate) && (
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setSelectedDate("");
              }}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[12px] font-black text-slate-500 transition hover:bg-slate-50"
            >
              <X className="h-4 w-4" />
              Xóa bộ lọc
            </button>
          </div>
        )}
      </div>

      <div className="p-4 sm:p-6">
        <Msg error={err} />

        {loading ? (
          <Loading />
        ) : sections.length === 0 ? (
          <div className="rounded-[24px] border border-dashed border-blue-200 bg-blue-50/40 px-6 py-12 text-center">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-white text-blue-500 shadow-sm">
              <ImageIcon className="h-8 w-8" strokeWidth={2} />
            </div>

            <div className="mt-4 text-[18px] font-black text-[#0d2346]">
              Chưa có ảnh đơn phù hợp
            </div>

            <p className="mx-auto mt-2 max-w-[560px] text-[14px] font-semibold leading-6 text-slate-500">
              Đơn vừa tạo mà thiếu ảnh cần được upload bổ sung trước.
              Bạn cũng có thể thay đổi từ khóa hoặc ngày để tìm lại.
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {sections.map((section) => (
              <div key={section.key}>
                <div className="mb-4 flex items-center gap-4">
                  <div className="h-px flex-1 bg-gradient-to-r from-transparent to-blue-200" />

                  <div className="rounded-full border border-blue-200 bg-blue-50 px-5 py-2 text-[13px] font-black tracking-[0.05em] text-blue-700 shadow-sm sm:text-[14px]">
                    {section.label}
                  </div>

                  <div className="h-px flex-1 bg-gradient-to-l from-transparent to-blue-200" />
                </div>

                <div className="grid gap-4 xl:grid-cols-2">
                  {section.groups.map((group) => {
                    const groupImages = images
                      .filter(
                        (image) =>
                          image.group_id === group.id,
                      )
                      .map((image) => urls[image.id])
                      .filter(Boolean);

                    return (
                      <article
                        key={group.id}
                        className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_12px_30px_rgba(15,23,42,.06)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_38px_rgba(15,23,42,.09)]"
                      >
                        <div className="flex items-start justify-between gap-3 border-b border-slate-100 bg-gradient-to-r from-white to-blue-50/40 p-4 sm:p-5">
                          <div className="min-w-0">
                            <div className="truncate text-[19px] font-black text-[#0d2346] sm:text-[21px]">
                              {group.customer_name}
                            </div>

                            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] font-bold text-slate-500 sm:text-[13px]">
                              <span className="rounded-lg bg-blue-50 px-2 py-1 text-blue-700">
                                {group.root_code}
                              </span>
                              <span>
                                {vietnamDateTime(
                                  group.created_at,
                                )}
                              </span>
                              <span>· {groupImages.length} ảnh</span>
                            </div>
                          </div>

                          <Link
                            href="/azalas/orders"
                            className="inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 text-[12px] font-black text-blue-700 transition hover:bg-blue-100 sm:text-[13px]"
                          >
                            <Eye className="h-4 w-4" />
                            Xem đơn
                          </Link>
                        </div>

                        {group.creator_note && (
                          <div className="mx-4 mt-4 rounded-xl border border-amber-100 bg-amber-50/60 px-3 py-2 text-[13px] font-semibold leading-5 text-slate-600 sm:mx-5">
                            {group.creator_note}
                          </div>
                        )}

                        <div className="p-4 sm:p-5">
                          <ImageViewer
                            urls={groupImages}
                            label={`Ảnh đơn ${group.root_code}`}
                          />
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
