export function LoadingState({ label = "正在加载…" }: { label?: string }) {
  return <div className="state-card loading-state" role="status">{label}</div>;
}
