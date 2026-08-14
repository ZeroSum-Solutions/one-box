# Task 09 v1: seeded code review

Review the following component for type, security, lifecycle, and accessibility
defects. Report only concrete findings at high or medium severity. For each, give
category, exact line or symbol, failure scenario, and smallest safe remediation.
Do not rewrite the component, invent blockers, score the review, or mention model
or provider identity.

```tsx
import { useEffect, useRef } from "react";

export function Preview({ html, origin }: { html: unknown; origin: string }) {
  const frame = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.data.type === "resize") frame.current!.style.height = `${event.data.height}px`;
    };
    window.addEventListener("message", onMessage);
  }, [origin]);

  return (
    <div onClick={() => frame.current?.contentWindow?.postMessage({ type: "edit" }, "*")}>
      Edit preview
      <iframe ref={frame} srcDoc={html as string} title="preview" />
    </div>
  );
}
```
