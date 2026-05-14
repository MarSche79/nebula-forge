import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { requireAuth } from "./auth.js";
import { config } from "./config.js";
import { insertUpload, listUploads } from "./storage.js";

export const uploadsRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
});

uploadsRouter.get("/", requireAuth, async (req, res) => {
  res.json(await listUploads(req.user!.oid));
});

uploadsRouter.post("/", requireAuth, upload.single("file"), async (req, res) => {
  const file = req.file;
  if (!file) { res.status(400).json({ error: "No file" }); return; }

  let sharepointUrl: string | null = null;
  if (config.saveDocWebhook) {
    try {
      const r = await fetch(config.saveDocWebhook, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          folder: config.uploadsLibrary,
          fileName: file.originalname,
          contentBase64: file.buffer.toString("base64"),
          contentType: file.mimetype,
          uploadedBy: req.user!.upn || req.user!.name || req.user!.oid,
        }),
      });
      if (r.ok) {
        try {
          const json = (await r.json()) as { webUrl?: string; url?: string };
          sharepointUrl = json.webUrl ?? json.url ?? null;
        } catch { /* flow returned empty body */ }
      } else {
        console.warn("[upload] flow returned", r.status);
      }
    } catch (e) {
      console.warn("[upload] flow error", (e as Error).message);
    }
  }

  const row = await insertUpload({
    userOid: req.user!.oid,
    fileName: file.originalname,
    size: file.size,
    contentType: file.mimetype,
    sharepointUrl,
  });
  res.status(201).json(row);
});

// "Save to SharePoint" for a generated Markdown document
export const generateRouter = Router();
generateRouter.post("/save-doc", requireAuth, async (req, res) => {
  const body = z.object({
    fileName: z.string().trim().min(1).max(200),
    markdown: z.string().min(1).max(200_000),
    folder: z.string().trim().min(1).max(120).default("GeneratedDocs"),
  }).safeParse(req.body ?? {});
  if (!body.success) { res.status(400).json({ error: "Invalid body" }); return; }
  if (!config.saveDocWebhook) { res.status(503).json({ error: "Save-doc flow not configured" }); return; }

  const r = await fetch(config.saveDocWebhook, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      folder: body.data.folder,
      fileName: body.data.fileName.endsWith(".md") ? body.data.fileName : `${body.data.fileName}.md`,
      content: body.data.markdown,
      contentType: "text/markdown",
      uploadedBy: req.user!.upn || req.user!.name || req.user!.oid,
    }),
  });
  if (!r.ok) {
    res.status(502).json({ error: `Flow returned ${r.status}` });
    return;
  }
  let webUrl: string | null = null;
  try {
    const json = (await r.json()) as { webUrl?: string };
    webUrl = json.webUrl ?? null;
  } catch { /* empty */ }
  res.json({ ok: true, webUrl });
});
