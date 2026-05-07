"use server";

import { redirect } from "next/navigation";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { JobStatus, Prisma, type SoftwareInstallerSource } from "@prisma/client";
import { z } from "zod";

import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { filterSupportedJobStatuses } from "@/lib/job-status-server";
import { sanitizeOptionalText, sanitizeText } from "@/lib/sanitize";
import { requireOrgSession } from "@/lib/org-context";
import { getUploadsRoot } from "@/lib/storage";
import { checkJobLimit } from "@/lib/plan-limits";
import { rateLimit } from "@/lib/rate-limit";

const deviceSchema = z
  .object({
  deviceType: z.enum([
    "PHONE_ANDROID",
    "PHONE_IPHONE",
    "TABLET",
    "WINDOWS_PC",
    "MAC",
    "OTHER",
  ]),
  brand: z.string().min(1),
  model: z.string().min(1),
  serialOrImei: z.string().optional(),
  accessories: z.string().optional(),
  physicalNotes: z.string().optional(),
  serviceType: z.enum(["HARDWARE", "SOFTWARE", "BOTH"]).optional(),
  softwareOsInstall: z.boolean().optional(),
  softwareDriversUpdates: z.boolean().optional(),
  softwareDataBackupRestore: z.boolean().optional(),
  softwareAccountSetup: z.boolean().optional(),
  softwarePerformanceTune: z.boolean().optional(),
  softwareThirdPartyApps: z.boolean().optional(),
  softwareRequestedNotes: z.string().optional(),
  softwareLicenseAttested: z.boolean().optional(),
  softwareInstallerSource: z
    .enum([
      "CLIENT_PROVIDED_INSTALLER",
      "CLIENT_ACCOUNT_LOGIN",
      "COMPANY_LICENSE",
      "OPEN_SOURCE",
      "OTHER",
    ])
    .optional()
    .or(z.literal("")),
  softwareInstallerSourceNote: z.string().optional(),
  issueDescription: z.string().min(5),
  })
  .superRefine((value, ctx) => {
    const serviceType = value.serviceType ?? "HARDWARE";
    if (serviceType !== "HARDWARE" && !value.softwareLicenseAttested) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Software jobs require license attestation.",
        path: ["softwareLicenseAttested"],
      });
    }
  });

const newJobSchema = z.object({
  fullName: z.string().min(2),
  phone: z.string().min(3),
  email: z.string().email().optional().or(z.literal("")),
  organization: z.string().optional(),
  devicesJson: z.string().min(2),
  receivedAt: z.string().optional(),
});

function parseDevices(devicesJson: string) {
  let raw: unknown;
  try {
    raw = JSON.parse(devicesJson);
  } catch {
    return { ok: false as const, error: "Invalid devices payload" };
  }

  const parsed = z.array(deviceSchema).min(1).max(10).safeParse(raw);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid device details" };
  }
  return { ok: true as const, devices: parsed.data };
}

export async function generateJobNumber(orgId?: string) {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const prefix = `EIS-${month}/${year}/`;
  const latest = await prisma.job.findFirst({
    where: { jobNumber: { startsWith: prefix }, ...(orgId ? { orgId } : {}) },
    orderBy: { jobNumber: "desc" },
    select: { jobNumber: true },
  });

  const latestSeq = latest?.jobNumber.slice(prefix.length) ?? "0";
  const numeric = Number(latestSeq);
  const next = Number.isFinite(numeric) ? numeric + 1 : 1;
  return `${prefix}${String(next).padStart(4, "0")}`;
}

export async function createJobAction(
  _prevState: { error: string | null },
  formData: FormData,
): Promise<{ error: string | null }> {
  try {
    const { session, user, orgId } = await requireOrgSession();

    if (!can.createJob(user)) {
      return { error: "You cannot create jobs." };
    }

    const rl = rateLimit.jobCreate(orgId);
    if (!rl.allowed) {
      return { error: "Too many jobs created in a short period. Please wait a moment and try again." };
    }

    const jobLimit = await checkJobLimit(orgId);
    if (!jobLimit.allowed) {
      return { error: jobLimit.reason };
    }

    const raw = Object.fromEntries(formData.entries());
    const parsed = newJobSchema.safeParse(raw);

    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Invalid form values" };
    }

    const client = await prisma.client.upsert({
      where: { phone_orgId: { orgId, phone: sanitizeText(parsed.data.phone) } },
      create: {
        orgId,
        fullName: sanitizeText(parsed.data.fullName),
        phone: sanitizeText(parsed.data.phone),
        email: sanitizeOptionalText(parsed.data.email),
        organization: sanitizeOptionalText(parsed.data.organization),
      },
      update: {
        fullName: sanitizeText(parsed.data.fullName),
        email: sanitizeOptionalText(parsed.data.email),
        organization: sanitizeOptionalText(parsed.data.organization),
      },
    });

    const parsedDevices = parseDevices(parsed.data.devicesJson);
    if (!parsedDevices.ok) {
      return { error: parsedDevices.error };
    }
    const devices = parsedDevices.devices;
    const allowed = new Set(["image/jpeg", "image/png", "image/webp"]);
    const maxSize = 5 * 1024 * 1024;
    const receivedAt = parsed.data.receivedAt ? new Date(parsed.data.receivedAt) : new Date();

    const openStatuses = filterSupportedJobStatuses([
      "RECEIVED",
      "DIAGNOSING",
      "REFERRED",
      "IN_EXTERNAL_REPAIR",
      "WAITING_FOR_PARTS",
      "RETURNED_FROM_EXTERNAL",
      "AWAITING_APPROVAL",
      "IN_REPAIR",
      "READY_FOR_PICKUP",
    ]) as JobStatus[];

    const createdJobs: Array<{ id: string }> = [];

    for (let i = 0; i < devices.length; i += 1) {
      const device = devices[i];
      const serial = sanitizeOptionalText(device.serialOrImei);
      if (serial) {
        const dup = await prisma.job.findFirst({
          where: {
            orgId,
            clientId: client.id,
            serialOrImei: serial,
            status: { in: openStatuses },
          },
          select: { id: true, jobNumber: true },
        });
        if (dup) {
          return { error: `An open job already exists for this device serial/IMEI: ${dup.jobNumber}` };
        }
      }

    let deviceId: string | null = null;
    try {
      const createdDevice = await prisma.device.create({
        data: {
          orgId,
          clientId: client.id,
          deviceType: device.deviceType,
          brand: sanitizeText(device.brand),
          model: sanitizeText(device.model),
          serialOrImei: serial,
          accessories: sanitizeOptionalText(device.accessories),
          physicalNotes: sanitizeOptionalText(device.physicalNotes),
        },
        select: { id: true },
      });
      deviceId = createdDevice.id;
    } catch (error) {
      // If Device table isn't migrated in a given environment, fall back to legacy Job-only storage.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === "P2021" || error.code === "P2022")
      ) {
        deviceId = null;
      } else {
        throw error;
      }
    }

    let job: { id: string } | null = null;
    let includeSoftwareFields = true;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const jobNumber = await generateJobNumber(orgId);
      try {
        const serviceType = device.serviceType ?? "HARDWARE";
        const softwareRequestedNotes = sanitizeOptionalText(device.softwareRequestedNotes);
        const softwareInstallerSourceNote = sanitizeOptionalText(device.softwareInstallerSourceNote);

        const rawInstallerSource = (device as { softwareInstallerSource?: unknown }).softwareInstallerSource;
        const allowedInstallerSources = new Set<SoftwareInstallerSource>([
          "CLIENT_PROVIDED_INSTALLER",
          "CLIENT_ACCOUNT_LOGIN",
          "COMPANY_LICENSE",
          "OPEN_SOURCE",
          "OTHER",
        ]);
        const normalizedInstallerSource =
          typeof rawInstallerSource === "string" && allowedInstallerSources.has(rawInstallerSource as SoftwareInstallerSource)
            ? (rawInstallerSource as SoftwareInstallerSource)
            : undefined;

        const softwareFields = {
          serviceType,
          softwareOsInstall: Boolean(device.softwareOsInstall),
          softwareDriversUpdates: Boolean(device.softwareDriversUpdates),
          softwareDataBackupRestore: Boolean(device.softwareDataBackupRestore),
          softwareAccountSetup: Boolean(device.softwareAccountSetup),
          softwarePerformanceTune: Boolean(device.softwarePerformanceTune),
          softwareThirdPartyApps: Boolean(device.softwareThirdPartyApps),
          softwareRequestedNotes,
          softwareLicenseAttested: Boolean(device.softwareLicenseAttested),
          softwareInstallerSource: normalizedInstallerSource,
          softwareInstallerSourceNote,
        } as const;

        job = await prisma.job.create({
          data: {
            orgId,
            jobNumber,
            clientId: client.id,
            createdById: session.user.id,
            ...(deviceId ? { deviceId } : {}),
            deviceType: device.deviceType,
            brand: sanitizeText(device.brand),
            model: sanitizeText(device.model),
            serialOrImei: serial,
            accessories: sanitizeOptionalText(device.accessories),
            physicalNotes: sanitizeOptionalText(device.physicalNotes),
            issueDescription: sanitizeText(device.issueDescription),
            ...(includeSoftwareFields && serviceType !== "HARDWARE" ? { repairPath: "IN_HOUSE" } : {}),
            ...(includeSoftwareFields ? softwareFields : {}),
            receivedAt,
          },
          select: { id: true },
        });
        break;
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
          if (error.code === "P2002") {
            continue;
          }
          // deviceId column missing in some environments
          if (error.code === "P2022") {
            // serviceType/software columns may not be migrated yet.
            // Drop them and retry.
            const message = error.message || "";
            if (
              message.includes("serviceType") ||
              message.includes("softwareOsInstall") ||
              message.includes("softwareDriversUpdates") ||
              message.includes("softwareDataBackupRestore") ||
              message.includes("softwareAccountSetup") ||
              message.includes("softwarePerformanceTune") ||
              message.includes("softwareThirdPartyApps") ||
              message.includes("softwareRequestedNotes") ||
              message.includes("softwareLicenseAttested") ||
              message.includes("softwareInstallerSource") ||
              message.includes("softwareInstallerSourceNote")
            ) {
              includeSoftwareFields = false;
              continue;
            }
            deviceId = null;
            continue;
          }
        }
        throw error;
      }
    }

      if (!job) {
        return { error: "Could not allocate unique job number. Please retry." };
      }

    createdJobs.push(job);

    await prisma.auditLog.create({
      data: {
        orgId,
        jobId: job.id,
        userId: session.user.id,
        action: "JOB_CREATED",
        detail: JSON.stringify({ status: "RECEIVED" }),
      },
    });

      const files = formData.getAll(`photos_${i}`) as File[];
      if (files.length > 0) {
      const uploadDir = path.join(getUploadsRoot(), "jobs", job.id);
      await mkdir(uploadDir, { recursive: true });

      for (const file of files) {
        if (!file?.size) continue;
        if (!allowed.has(file.type) || file.size > maxSize) {
          continue;
        }
        const ext = file.type.split("/")[1] || "jpg";
        const fileName = `${Date.now()}-${randomUUID()}.${ext}`;
        const absPath = path.join(uploadDir, fileName);
        await writeFile(absPath, Buffer.from(await file.arrayBuffer()));
        await prisma.photo.create({
          data: {
            jobId: job.id,
            label: "before",
            url: `/api/uploads/jobs/${job.id}/${fileName}`,
          },
        });
      }
      }
    }

    redirect(createdJobs.length === 1 ? `/jobs/${createdJobs[0]!.id}` : "/jobs");
  } catch (err) {
    // Preserve Next redirect behavior
    const digest =
      err && typeof err === "object" && "digest" in err
        ? String((err as { digest?: unknown }).digest)
        : "";
    if (digest.includes("NEXT_REDIRECT")) throw err;

    const msg = err instanceof Error ? err.message : "Failed to create job";
    console.error("[createJobAction]", msg);
    return { error: msg };
  }
}
