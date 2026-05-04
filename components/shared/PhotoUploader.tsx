"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useRef, useTransition } from "react";
import { toast } from "sonner";

type Photo = {
  id: string;
  url: string;
  label: string | null;
};

export function PhotoUploader({
  jobId,
  photos,
  canDelete,
}: {
  jobId: string;
  photos: Photo[];
  canDelete: boolean;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="space-y-4">
      <form
        ref={formRef}
        action={(formData) => {
          startTransition(async () => {
            formData.append("jobId", jobId);
            const res = await fetch("/api/upload", { method: "POST", body: formData });
            if (!res.ok) {
              toast.error("Upload failed");
              return;
            }
            toast.success("Uploaded");
            formRef.current?.reset();
            router.refresh();
          });
        }}
        className="flex flex-wrap items-center gap-2"
      >
        <select name="label" className="rounded-md border border-[var(--line)] px-2 py-1">
          <option value="before">Before</option>
          <option value="during">During</option>
          <option value="after">After</option>
          <option value="other">Other</option>
        </select>
        <input name="files" type="file" accept="image/png,image/jpeg,image/webp" multiple required />
        <button disabled={isPending} className="rounded-md bg-black px-3 py-2 text-sm text-white">
          Upload
        </button>
      </form>

      <div className="grid gap-3 md:grid-cols-3">
        {photos.map((photo) => (
          <div key={photo.id} className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-2">
            <Image src={photo.url} alt={photo.label ?? "job photo"} width={320} height={160} className="h-40 w-full rounded object-cover" />
            <div className="mt-2 flex items-center justify-between">
              <span className="text-xs text-[var(--ink-muted)]">{photo.label ?? "-"}</span>
              {canDelete ? (
                <form
                  action={async () => {
                    const res = await fetch(`/api/upload?id=${photo.id}`, { method: "DELETE" });
                    if (!res.ok) {
                      toast.error("Delete failed");
                      return;
                    }
                    router.refresh();
                  }}
                >
                  <button
                    type="submit"
                    onClick={(event) => {
                      if (!window.confirm("Delete this photo?")) {
                        event.preventDefault();
                      }
                    }}
                    className="text-xs text-[var(--ink)] underline"
                  >
                    Delete
                  </button>
                </form>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
