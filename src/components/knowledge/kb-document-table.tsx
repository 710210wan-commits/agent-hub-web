import { Check, FileText, Folder, X } from "lucide-react";
import { useMemo, useState } from "react";

import { formatKbBytes, formatKbDateTime } from "@/lib/kb-format";
import {
  canDownloadKbDocument,
  canIndexKbDocument,
  canParseKbDocument,
  canReindexKbDocument,
  type KbDocument,
  type KbIndexStatus,
  type KbParseStatus,
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
    <span className={`kb-status-indicator is-${appearance.tone}`}>
      <span aria-hidden="true" className="kb-status-indicator-dot">
        {loading ? (
          <span className="kb-spinner" />
        ) : appearance.tone === "success" ? (
          <Check size={10} strokeWidth={3} />
        ) : appearance.tone === "danger" ? (
          <X size={10} strokeWidth={3} />
        ) : null}
      </span>
      {appearance.label}
    </span>
  );
}

type SortKey = "filename" | "parse" | "index" | "size" | "updated";

const PARSE_RANK: Record<KbParseStatus, number> = {
  waiting: 0,
  parsing: 1,
  parsed: 2,
  failed: 3,
};

const INDEX_RANK: Record<KbIndexStatus, number> = {
  waiting: 0,
  indexing: 1,
  indexed: 2,
  failed: 3,
};

function compareDocuments(
  left: KbDocument,
  right: KbDocument,
  key: SortKey,
): number {
  switch (key) {
    case "filename":
      return left.filename.localeCompare(right.filename, "zh-CN");
    case "parse":
      return PARSE_RANK[left.parse_status] - PARSE_RANK[right.parse_status];
    case "index":
      return INDEX_RANK[left.index_status] - INDEX_RANK[right.index_status];
    case "size":
      return (left.file_size ?? 0) - (right.file_size ?? 0);
    case "updated":
      return (
        Date.parse(left.updated_at ?? "") - Date.parse(right.updated_at ?? "")
      );
  }
}

function SortableHeader({
  label,
  sortKey,
  sort,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  sort: { key: SortKey; direction: "asc" | "desc" } | null;
  onSort: (key: SortKey) => void;
}) {
  const active = sort?.key === sortKey;
  return (
    <th scope="col">
      <button
        aria-label={`按${label}排序`}
        className={`kb-sort-button${active ? " is-active" : ""}`}
        onClick={() => onSort(sortKey)}
        type="button"
      >
        {label}
        <span aria-hidden="true" className="kb-sort-arrow">
          {active ? (sort?.direction === "asc" ? "↑" : "↓") : "↕"}
        </span>
      </button>
    </th>
  );
}

export function KbDocumentTable({
  documents,
  selectedIds,
  selectionEnabled,
  deleting,
  acting,
  onToggleSelect,
  onToggleSelectAll,
  onPreview,
  onShowReason,
  onParse,
  onIndex,
  onDownload,
  onDelete,
  onOpenFolder,
}: {
  documents: KbDocument[];
  selectedIds: string[];
  selectionEnabled: boolean;
  deleting: boolean;
  acting: boolean;
  onToggleSelect: (document: KbDocument, checked: boolean) => void;
  onToggleSelectAll: (checked: boolean) => void;
  onPreview: (document: KbDocument) => void;
  onShowReason: (document: KbDocument) => void;
  onParse: (document: KbDocument) => void;
  onIndex: (document: KbDocument) => void;
  onDownload: (document: KbDocument) => void;
  onDelete: (document: KbDocument) => void;
  onOpenFolder: (document: KbDocument) => void;
}) {
  const [sort, setSort] = useState<{
    key: SortKey;
    direction: "asc" | "desc";
  } | null>(null);

  const sortedDocuments = useMemo(() => {
    const folders = documents.filter((document) => document.is_folder);
    const files = documents.filter((document) => !document.is_folder);
    if (!sort) {
      return [...folders, ...files];
    }
    const direction = sort.direction === "asc" ? 1 : -1;
    const sortedFiles = [...files].sort(
      (left, right) => compareDocuments(left, right, sort.key) * direction,
    );
    return [...folders, ...sortedFiles];
  }, [documents, sort]);

  function handleSort(key: SortKey) {
    setSort((current) => {
      if (current?.key !== key) {
        return { key, direction: "asc" };
      }
      return {
        key,
        direction: current.direction === "asc" ? "desc" : "asc",
      };
    });
  }

  const deletableDocuments = documents.filter((document) => !document.is_folder);
  const allSelected =
    deletableDocuments.length > 0 &&
    deletableDocuments.every((document) => selectedIds.includes(document.file_id));

  return (
    <div className="kb-table-wrap">
      <table className="kb-table">
        <thead>
          <tr>
            {selectionEnabled ? (
              <th className="kb-select-cell" scope="col">
                <input
                  aria-label="全选文档"
                  checked={allSelected}
                  disabled={deletableDocuments.length === 0 || deleting}
                  onChange={(event) => onToggleSelectAll(event.target.checked)}
                  type="checkbox"
                />
              </th>
            ) : null}
            <SortableHeader
              label="文件名"
              onSort={handleSort}
              sort={sort}
              sortKey="filename"
            />
            <SortableHeader
              label="解析状态"
              onSort={handleSort}
              sort={sort}
              sortKey="parse"
            />
            <SortableHeader
              label="入库状态"
              onSort={handleSort}
              sort={sort}
              sortKey="index"
            />
            <SortableHeader
              label="大小"
              onSort={handleSort}
              sort={sort}
              sortKey="size"
            />
            <SortableHeader
              label="更新时间"
              onSort={handleSort}
              sort={sort}
              sortKey="updated"
            />
            <th scope="col">操作</th>
          </tr>
        </thead>
        <tbody>
          {sortedDocuments.map((document, index) => {
            const failed =
              document.parse_status === "failed" ||
              document.index_status === "failed";
            const selected = selectedIds.includes(document.file_id);

            return (
              <tr key={document.file_id || `${document.filename}-${index}`}>
                {selectionEnabled ? (
                  <td className="kb-select-cell">
                    {document.is_folder ? (
                      <span className="kb-muted">—</span>
                    ) : (
                      <input
                        aria-label={`选择 ${document.filename}`}
                        checked={selected}
                        disabled={deleting}
                        onChange={(event) =>
                          onToggleSelect(document, event.target.checked)
                        }
                        type="checkbox"
                      />
                    )}
                  </td>
                ) : null}
                <td>
                  {document.is_folder ? (
                    <button
                      className="kb-file-name is-folder"
                      onClick={() => onOpenFolder(document)}
                      title={document.filename}
                      type="button"
                    >
                      <Folder aria-hidden="true" size={14} />
                      <span>{document.filename || "—"}</span>
                    </button>
                  ) : (
                    <span className="kb-file-name">
                      <FileText aria-hidden="true" size={14} />
                      <span title={document.filename}>
                        {document.filename || "—"}
                      </span>
                    </span>
                  )}
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
                    <div className="kb-row-actions">
                      <button
                        className="kb-link-button"
                        onClick={() => onOpenFolder(document)}
                        type="button"
                      >
                        打开
                      </button>
                      <button
                        className="kb-link-button is-danger"
                        disabled={deleting}
                        onClick={() => onDelete(document)}
                        type="button"
                      >
                        删除
                      </button>
                    </div>
                  ) : (
                    <div className="kb-row-actions">
                      <button
                        className="kb-link-button"
                        onClick={() => onPreview(document)}
                        type="button"
                      >
                        预览
                      </button>
                      {canParseKbDocument(document) ? (
                        <button
                          className="kb-link-button"
                          disabled={acting}
                          onClick={() => onParse(document)}
                          type="button"
                        >
                          {document.status === "error_parsing" ? "重试解析" : "解析"}
                        </button>
                      ) : null}
                      {canIndexKbDocument(document) ? (
                        <button
                          className="kb-link-button"
                          disabled={acting}
                          onClick={() => onIndex(document)}
                          type="button"
                        >
                          {canReindexKbDocument(document)
                            ? "重新入库"
                            : document.status === "error_indexing"
                              ? "重试入库"
                              : "入库"}
                        </button>
                      ) : null}
                      {canDownloadKbDocument(document) ? (
                        <button
                          className="kb-link-button"
                          disabled={acting}
                          onClick={() => onDownload(document)}
                          type="button"
                        >
                          下载原件
                        </button>
                      ) : null}
                      {failed ? (
                        <button
                          className="kb-link-button"
                          onClick={() => onShowReason(document)}
                          type="button"
                        >
                          查看原因
                        </button>
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
