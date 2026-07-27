import { useEffect, useState } from "react";
import { Loader2, Trash2, Download, RefreshCw, Image } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface GalleryImage {
  id: number;
  url: string;
  filename: string;
  created_at: string;
  params?: string;
}

export default function ImageGallery() {
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [loading, setLoading] = useState(true);
  const BASE = import.meta.env.VITE_BACKEND_URL || "";

  const fetchImages = async () => {
    try {
      const res = await fetch(`/api/images/history`);
      if (res.ok) {
        const data = await res.json();
        setImages(data.images || []);
      }
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchImages();
    const handler = () => fetchImages();
    window.addEventListener("gallery-refresh", handler);
    return () => window.removeEventListener("gallery-refresh", handler);
  }, []);

  const handleDelete = async (id: number) => {
    setImages((prev) => prev.filter((img) => img.id !== id));
    try {
      await fetch(`/api/images/history/${id}`, { method: "DELETE" });
    } catch { /* background cleanup — UI already updated */ }
  };

  const handleDownload = (url: string, filename: string) => {
    const a = document.createElement("a");
    a.href = `${BASE}${url}`;
    a.download = filename;
    a.click();
  };

  const handleUseInStudio = (img: GalleryImage) => {
    let params = {};
    if (img.params) {
      try { params = JSON.parse(img.params); } catch {}
    }
    window.dispatchEvent(new CustomEvent("studio-load", {
      detail: { imageUrl: `${BASE}${img.url}`, ...params },
    }));
    toast.success("Loaded into Studio");
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-zinc-800 dark:text-zinc-100">Gallery</h2>
        <Button size="sm" variant="outline" className="rounded-xl gap-1" onClick={fetchImages}>
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
      </div>

      {images.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center text-center text-muted-foreground">
          <Image className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No images saved yet</p>
          <p className="text-xs mt-1">Try generating an image at Studio workspace.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {images.map((img) => (
            <div key={img.id} className="group relative overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-700">
              <img src={`${BASE}${img.url}`} alt="" className="w-full object-cover aspect-square cursor-pointer"
                onClick={() => handleUseInStudio(img)} />
              <div className="absolute inset-0 flex items-end justify-center gap-2 bg-black/0 p-2 opacity-0 transition-all group-hover:bg-black/40 group-hover:opacity-100">
                <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full bg-white/80 text-zinc-800 hover:bg-white"
                  onClick={() => handleDownload(img.url, img.filename)}>
                  <Download className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full bg-white/80 text-red-600 hover:bg-white"
                  onClick={() => handleDelete(img.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              {img.params && (
                <div className="absolute top-1 left-1 text-[9px] bg-black/50 text-white px-1.5 py-0.5 rounded pointer-events-none truncate max-w-[90%]">
                  {(() => { try { const p = JSON.parse(img.params!); return p.model || p.prompt?.slice(0, 30) || ""; } catch { return ""; } })()}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
