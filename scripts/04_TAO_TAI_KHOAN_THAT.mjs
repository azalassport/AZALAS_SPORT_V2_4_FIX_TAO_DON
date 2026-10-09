// 04_TAO_TAI_KHOAN_THAT.mjs
// Dat file vao: scripts/04_TAO_TAI_KHOAN_THAT.mjs
// Chay:
//   node scripts/04_TAO_TAI_KHOAN_THAT.mjs
//
// OWNER goc hien tai = Admin.
// File nay tao them:
// Trangha OWNER
// Hale ADMIN
// Minhthu/Thupham/Phuc/Tri/Ly/Ty/Hoang/Thuy MEMBER
//
// Password duoc migrate bang password_hash de giu dung pass ngan tu app cu.

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

function loadEnv(file) {
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

loadEnv(path.resolve(process.cwd(), ".env.local"));
loadEnv(path.resolve(process.cwd(), ".env.cloudflare"));

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  throw new Error(
    "Thieu NEXT_PUBLIC_SUPABASE_URL hoac SUPABASE_SERVICE_ROLE_KEY."
  );
}

const sb = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const accounts = [
  { login: 'trangha', displayName: 'Trang Hà', role: 'OWNER', passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$JQtulA0CILYePwOvjket/w$WYIsB0q9ULKxDySQZT0zIbtdcm12MOUlgIGfqLAykZg' },
  { login: 'hale', displayName: 'Hạ Lê', role: 'ADMIN', passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$lK7Rlvs6vWqlg6xyzFtsjg$SxcTFxKMXqsRaKWWjSE03JjIzVJdgubicJG+AGc0zbQ' },
  { login: 'minhthu', displayName: 'Thư Nhỏ', role: 'MEMBER', passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$Sy/f7QqnNC1pYHheQkMKfA$VNneByKy6vuYJpuA645yE8v/7YozxpJoWBnay/fpQOM' },
  { login: 'thupham', displayName: 'Thư Phạm', role: 'MEMBER', passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$1dL7MLpLuxK8Ac09wmQQpQ$1feVIPtPaTWvuUBDK25//J7ql8f7X1pX6Wfq5lsj5K0' },
  { login: 'phuc', displayName: 'Phúc', role: 'MEMBER', passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$6j5GpjXmChj4unggTGQrNQ$G7jo7eerxvqYzPCxK43LG+fheAqTWiVkT3ais4PnNAc' },
  { login: 'tri', displayName: 'Trí', role: 'MEMBER', passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$fhhkaNWSoflUxMPs0e44pQ$zAuG6E12MO3uBNTS27h3bRPMEvTN/Op0q7ZtsJb+VBs' },
  { login: 'ly', displayName: 'Lý', role: 'MEMBER', passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$g2TQ+8Ar30DWVNTP4G4QaA$2Bt3IWgWikzOwJr+asVbP9EOWC8+UHPPFiNP98zlXpk' },
  { login: 'ty', displayName: 'Ty', role: 'MEMBER', passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$XvYlhlz8FYHe7ZejHNG6rg$zMqDbBX7om/lwC4mt7W9hUo7SNDAsAUAv/4PTH2BRjQ' },
  { login: 'hoang', displayName: 'Hoàng', role: 'MEMBER', passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$tSdq11P72NH8jgav6Xg+Ow$YgTRpm+fI4FGZEun9bsVUPPS8M3u5w3sD/AFcGLfccU' },
  { login: 'thuy', displayName: 'Thúy', role: 'MEMBER', passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$uu9jtZuCa03iw/96MJ/Ghw$iX/a6eWYDeflyW8zbSh4Zw7mCkIUAbmImvvbKdYxqGs' }
];

async function listUsers() {
  const all = [];
  let page = 1;

  while (true) {
    const { data, error } = await sb.auth.admin.listUsers({
      page,
      perPage: 1000,
    });

    if (error) throw error;

    const users = data?.users || [];
    all.push(...users);

    if (users.length < 1000) break;
    page += 1;
  }

  return all;
}

async function findStaff(displayName) {
  const { data, error } = await sb
    .from("az_staff")
    .select("id,display_name,profile_id,status")
    .eq("display_name", displayName)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error(`Khong tim thay nhan vien: ${displayName}`);

  return data;
}

async function main() {
  console.log("=== AZALAS - TAO TAI KHOAN THAT ===");

  const { data: owners, error: ownerError } = await sb
    .from("az_profiles")
    .select("id,display_name,role,is_active,created_at")
    .eq("role", "OWNER")
    .order("created_at", { ascending: true });

  if (ownerError) throw ownerError;
  if (!owners?.length) throw new Error("Khong tim thay OWNER goc.");

  const rootOwner = owners[0];

  // Gan root OWNER -> Admin.
  const adminStaff = await findStaff("Admin");

  let { error } = await sb
    .from("az_profiles")
    .update({
      display_name: "Admin",
      role: "OWNER",
      is_active: true,
    })
    .eq("id", rootOwner.id);

  if (error) throw error;

  ({ error } = await sb
    .from("az_staff")
    .update({
      profile_id: rootOwner.id,
      status: "DANG_LAM",
      updated_by: rootOwner.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", adminStaff.id));

  if (error) throw error;

  let users = await listUsers();

  for (const item of accounts) {
    const email = `${item.login}@azalas.local`;
    const staff = await findStaff(item.displayName);

    let user = users.find(
      (x) => String(x.email || "").toLowerCase() === email.toLowerCase()
    );

    if (!user) {
      const { data, error: createError } =
        await sb.auth.admin.createUser({
          email,
          password_hash: item.passwordHash,
          email_confirm: true,
          user_metadata: {
            full_name: item.displayName,
            login_name: item.login,
            migrated_from_old_app: true,
          },
        });

      if (createError || !data?.user) {
        throw new Error(
          `Khong tao duoc ${item.login}: ${createError?.message || "Unknown error"}`
        );
      }

      user = data.user;
      users.push(user);

      console.log("TAO:", item.login, "/", item.role);
    } else {
      console.log("DA CO:", item.login);
    }

    const { error: profileError } = await sb
      .from("az_profiles")
      .upsert(
        {
          id: user.id,
          display_name: item.displayName,
          phone: null,
          login_name: item.login,
          role: item.role,
          is_active: true,
        },
        { onConflict: "id" }
      );

    if (profileError) {
      throw new Error(
        `Profile ${item.login}: ${profileError.message}`
      );
    }

    const { error: staffError } = await sb
      .from("az_staff")
      .update({
        profile_id: user.id,
        status: "DANG_LAM",
        updated_by: rootOwner.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", staff.id);

    if (staffError) {
      throw new Error(
        `Nhan vien ${item.displayName}: ${staffError.message}`
      );
    }

    console.log("OK:", item.login, "->", item.displayName);
  }

  console.log("");
  console.log("=== HOAN TAT ===");
}

main().catch((error) => {
  console.error("");
  console.error("TAO TAI KHOAN THAT BAI:");
  console.error(error);
  process.exitCode = 1;
});
