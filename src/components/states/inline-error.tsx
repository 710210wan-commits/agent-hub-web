import { CircleAlert } from "lucide-react";

export function InlineError({ message }: { message: string }) {
  return (
    <div className="inline-error" role="alert">
      <CircleAlert aria-hidden="true" size={15} />
      <span>{message}</span>
    </div>
  );
}
