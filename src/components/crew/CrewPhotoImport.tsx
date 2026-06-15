import { useRef, useState } from "react";
import { Camera, Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { extractCrewFromPhoto, type ExtractedCrewMember } from "@/lib/edge";
import { Button } from "@/components/ui/button";
import { DEPT_LABELS } from "@/lib/constants";

interface Props {
  onExtracted: (crew: ExtractedCrewMember[]) => void;
}

function resizeImageToBase64(dataUrl: string, maxPx = 1280): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.src = dataUrl;
  });
}

export function CrewPhotoImport({ onExtracted }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [scanning, setScanning] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  async function handleFile(file: File) {
    if (!file.type.startsWith("image/")) {
      toast.error("Please upload an image file.");
      return;
    }
    setScanning(true);

    const reader = new FileReader();
    reader.onload = async (e) => {
      const originalDataUrl = e.target?.result as string;
      setPreview(originalDataUrl);

      try {
        const resizedDataUrl = await resizeImageToBase64(originalDataUrl);
        const base64 = resizedDataUrl.split(",")[1];
        const crew = await extractCrewFromPhoto(base64, "image/jpeg");
        if (!crew.length) {
          toast.error("No crew found in image. Try a clearer photo of the crew list.");
        } else {
          toast.success(`Extracted ${crew.length} crew member${crew.length === 1 ? "" : "s"}.`);
          onExtracted(crew);
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Photo scanning failed.");
      } finally {
        setScanning(false);
      }
    };
    reader.readAsDataURL(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  }

  return (
    <div className="space-y-3">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleInputChange}
      />

      <div
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => !scanning && fileRef.current?.click()}
        className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-surface/50 px-6 py-8 text-center transition-colors hover:border-primary/40 hover:bg-primary/5"
      >
        {scanning ? (
          <>
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <div className="text-sm text-muted-foreground">Scanning crew list with AI…</div>
          </>
        ) : (
          <>
            <div className="flex gap-3">
              <Camera className="h-6 w-6 text-muted-foreground" />
              <Upload className="h-6 w-6 text-muted-foreground" />
            </div>
            <div>
              <div className="text-sm font-medium">Import crew from photo</div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                Drop a crew list image, or tap to photograph or upload
              </div>
            </div>
          </>
        )}
      </div>

      {preview && (
        <div className="relative">
          <img src={preview} alt="Crew list preview" className="h-32 w-full rounded-md object-cover" />
          <button
            onClick={() => setPreview(null)}
            className="absolute right-2 top-2 rounded-full bg-background/80 p-1 hover:bg-background"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

export function ExtractedCrewPreview({
  crew,
  onDiscard,
}: {
  crew: ExtractedCrewMember[];
  onDiscard: () => void;
}) {
  if (!crew.length) return null;
  return (
    <div className="rounded-lg border border-border bg-surface/50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-medium">
          {crew.length} crew member{crew.length === 1 ? "" : "s"} extracted
        </div>
        <Button variant="ghost" size="sm" onClick={onDiscard}>
          <X className="h-4 w-4" /> Discard
        </Button>
      </div>
      <div className="space-y-1.5">
        {crew.map((m, i) => (
          <div key={i} className="flex items-center gap-3 text-sm">
            <span className="font-medium">{m.full_name}</span>
            <span className="text-muted-foreground">
              {m.position ?? "—"} · {DEPT_LABELS[m.department] ?? m.department}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
