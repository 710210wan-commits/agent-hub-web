import { FileText, Folder } from "lucide-react";

import { formatKbBytes, formatKbDateTime } from "@/lib/kb-format";
import type {
  KbDocument,
  KbIndexStatus,
  KbParseStatus,
} from "@/lib/kb-api";

type StatusTone = "neutral" | "info" | "success" | "danger";

interface StatusAppearance {
  label: string;
  tone: StatusTone;
}

const PARSE_STATUS: Record<KbParseStatus, StatusAppearance> = {
  waiting: { label: "待解析", tone: "neutral" },
  parsing: { label: "解析中", tone: "info" },
  parsed: { label: "已解析", tone: "success" },
  failed: { label: "解析失败", tone: "danger" },
};

const INDEX_STATUS: Record<KbIndexStatus, StatusAppearance> = {
  waiting: { label: "待入库", tone: "neutral" },
  indexing: { label: "入库中", tone: "info" },
  indexed: { label: "已入库", tone: "success" },
  failed: { label: "入库失败", tone: "danger" },
};

function StatusTag({ appearance }: { appearance: StatusAppearance }) {
  const loading = appearance.tone === "info";
  return (
    <span className={`kb-status-tag is-${appearance.tone}`}>
      {loading ? <span aria-hidden="true" className="kb-spinner" /> : null}
      {appearance.label}
    </span>
  );
}

export function KbDocumentTable({
  documents,
  deletingFileId,
  onShowReason,
  onRetry,
  onDelete,
}: {
  documents: KbDocument[];
  deletingFileId: string | null;
  onShowReason: (document: KbDocument) => void;
  onRetry: (document: KbDocument) => void;
  onDelete: (document: KbDocument) => void;
}) {
  return (
    <div className="kb-table-wrap">
      <table className="kb-table">
        <thead>
          <tr>
            <th scope="col">文件名</th>
            <th scope="col">解析状态</th>
            <th scope="col">入库状态</th>
            <th scope="col">大小</th>
            <th scope="col">更新时间</th>
            <th scope="col">操作</th>
          </tr>
        </thead>
        <tbody>
          {documents.map((document, index) => {
            const failed =
              document.parse_status === "failed" ||
              document.index_status === "failed";
            const deleting = deletingFileId === document.file_id;

            return (
              <tr key={document.file_id || `${document.filename}-${index}`}>
                <td>
                  <span className="kb-file-name">
                    {document.is_folder ? (
                      <Folder aria-hidden="true" size={14} />
                    ) : (
                      <FileText aria-hidden="true" size={14} />
                    )}
                    <span title={document.filename}>
                      {document.filename || "—"}
                    </span>
                  </span>
                </td>
                <td>
                  {document.is_folder ? (
                    <span className="kb-muted">—</span>
                  ) : (
                    <StatusTag appearance={PARSE_STATUS[document.parse_status]} />
                  )}
                </td>
                <td>
                  {document.is_folder ? (
                    <span className="kb-muted">—</span>
                  ) : (
                    <StatusTag appearance={INDEX_STATUS[document.index_status]} />
                  )}
                </td>
                <td className="kb-muted">
                  {document.is_folder ? "—" : formatKbBytes(document.file_size)}
                </td>
                <td className="kb-muted">
                  {formatKbDateTime(document.updated_at)}
                </td>
                <td>
                  {document.is_folder ? (
                    <span className="kb-muted">—</span>
                  ) : (
                    <div className="kb-row-actions">
                      {failed ? (
                        <>
                          <button
                            className="kb-link-button"
                            onClick={() => onShowReason(document)}
                            type="button"
                          >
                            查看原因
                          </button>
                          <button
                            className="kb-link-button"
                            onClick={() => onRetry(document)}
                            type="button"
                          >
                            重试
                          </button>
                        </>
                      ) : null}
                      <button
                        className="kb-link-button is-danger"
                        disabled={deleting}
                        onClick={() => onDelete(document)}
                        type="button"
                      >
                        {deleting ? "删除中…" : "删除"}
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
