/** 知识库文档列表的每页条数（与接口 page_size 对应） */
export const KB_DOCUMENTS_PAGE_SIZE = 100;

/** 按总数和每页条数计算总页数；无数据时仍视为 1 页，避免出现「第 0 页」 */
export function getKbTotalPages(total: number, pageSize: number): number {
  if (!Number.isFinite(total) || total <= 0) {
    return 1;
  }
  if (!Number.isFinite(pageSize) || pageSize <= 0) {
    return 1;
  }
  return Math.max(1, Math.ceil(total / pageSize));
}

/** 把页码收敛到 [1, 总页数]，用于删除末页最后一条等场景 */
export function clampKbPage(
  page: number,
  total: number,
  pageSize: number,
): number {
  const totalPages = getKbTotalPages(total, pageSize);
  if (!Number.isFinite(page)) {
    return 1;
  }
  return Math.min(Math.max(1, Math.trunc(page)), totalPages);
}
