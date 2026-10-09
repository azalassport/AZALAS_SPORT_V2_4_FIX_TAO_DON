// 00_CLEAR_ALL_AZALAS_STORAGE.mjs
// XOA SACH FILE trong tat ca Supabase Storage bucket co ten bat dau bang "az-".
// GIU bucket/policy de app tiep tuc hoat dong.
// Chay:
//   node scripts/00_CLEAR_ALL_AZALAS_STORAGE.mjs

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;

  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;

    const i = line.indexOf("=");
    if (i < 1) continue;

    const key = line.slice(0, i).trim();
    let value = line.slice(i + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(path.resolve(process.cwd(), ".env.local"));
loadEnvFile(path.resolve(process.cwd(), ".env.cloudflare"));

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  throw new Error(
    "Thieu NEXT_PUBLIC_SUPABASE_URL hoac SUPABASE_SERVICE_ROLE_KEY trong .env.local/.env.cloudflare"
  );
}

const sb = createClient(url, serviceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function listFolder(bucket, folder = "") {
  const paths = [];
  let offset = 0;

  while (true) {
    const { data, error } = await sb.storage
      .from(bucket)
      .list(folder, {
        limit: 1000,
        offset,
        sortBy: { column: "name", order: "asc" },
      });

    if (error) {
      throw new Error(
        `Khong doc duoc bucket ${bucket}${folder ? `/${folder}` : ""}: ${error.message}`
      );
    }

    const items = data || [];

    for (const item of items) {
      const fullPath = folder ? `${folder}/${item.name}` : item.name;
      const isFile = Boolean(item.id) || Boolean(item.metadata);

      if (isFile) {
        paths.push(fullPath);
      } else {
        paths.push(...(await listFolder(bucket, fullPath)));
      }
    }

    if (items.length < 1000) break;
    offset += items.length;
  }

  return paths;
}

async function deleteInChunks(bucket, paths) {
  const chunkSize = 100;

  for (let i = 0; i < paths.length; i += chunkSize) {
    const chunk = paths.slice(i, i + chunkSize);
    const { error } = await sb.storage.from(bucket).remove(chunk);

    if (error) {
      throw new Error(
        `Xoa file bucket ${bucket} that bai: ${error.message}`
      );
    }
  }
}

async function main() {
  console.log("=== AZALAS - CLEAR STORAGE ===");

  const { data: buckets, error } = await sb.storage.listBuckets();

  if (error) {
    throw new Error(`Khong doc duoc danh sach bucket: ${error.message}`);
  }

  const appBuckets = (buckets || []).filter((bucket) =>
    String(bucket.id || bucket.name || "").startsWith("az-")
  );

  if (!appBuckets.length) {
    console.log("Khong tim thay bucket az-*.");
    return;
  }

  let totalDeleted = 0;

  for (const bucketInfo of appBuckets) {
    const bucket = String(bucketInfo.id || bucketInfo.name);
    const paths = await listFolder(bucket);

    if (!paths.length) {
      console.log(`EMPTY: ${bucket}`);
      continue;
    }

    console.log(`DELETE ${bucket}: ${paths.length} file`);
    await deleteInChunks(bucket, paths);
    totalDeleted += paths.length;
    console.log(`OK: ${bucket}`);
  }

  console.log("");
  console.log(`HOAN TAT - DA XOA ${totalDeleted} FILE.`);
  console.log("Bucket van duoc giu lai de app tiep tuc upload du lieu moi.");
}

main().catch((error) => {
  console.error("");
  console.error("CLEAR STORAGE THAT BAI:");
  console.error(error);
  process.exitCode = 1;
});
