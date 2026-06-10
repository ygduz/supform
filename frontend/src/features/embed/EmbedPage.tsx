import { useEffect } from "react";
import { RendererPage } from "../renderer/RendererPage";

/**
 * The form rendered bare for `<iframe>` embedding: no app chrome, and it reports its
 * height to the host page so the embed script can size the iframe to fit (no scrollbars).
 */
export function EmbedPage() {
  useEffect(() => {
    const postHeight = () => {
      window.parent?.postMessage(
        { type: "supform:resize", height: document.body.scrollHeight },
        "*",
      );
    };
    postHeight();
    const observer = new ResizeObserver(postHeight);
    observer.observe(document.body);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="embed-root">
      <RendererPage />
    </div>
  );
}
