import type { ReviewSubmissionViewModel } from "./review-view-model";

const MISSING = "后端未提供";

export function ReviewEvidence({ submission }: { submission: ReviewSubmissionViewModel }) {
  const report = submission.validationReport;
  const definition = report?.definition ?? submission.manifest?.definition;
  return (
    <div className="skill-review-evidence">
      <EvidenceSection title="Definition">
        {definition ? (
          <dl>
            <Row label="标题" value={definition.metadata.title} />
            <Row label="描述" value={definition.metadata.description} />
            <Row label="类型" value={definition.kind} />
            <Row label="版本" value={definition.metadata.version} />
            <Row label="执行" value={`${definition.execution.type} · ${definition.execution.entry}`} />
            <Row label="场景" value={definition.scenarios.join("、") || MISSING} />
          </dl>
        ) : <Missing />}
      </EvidenceSection>

      <EvidenceSection title="Requirement">
        {report?.requirement ? (
          <dl>
            <Row label="目标" value={report.requirement.goal} />
            <Row label="输入" value={report.requirement.input.description} />
            <Row label="输出" value={report.requirement.output.description} />
            <Row label="状态" value={report.requirement.status} />
            <Row label="成功标准" value={report.requirement.successCriteria.join("；") || MISSING} />
          </dl>
        ) : <Missing />}
      </EvidenceSection>

      <EvidenceSection title="Revision Diff">
        {report?.diff ? (
          <dl>
            <Row label="新增" value={report.diff.added.join("、") || "无"} />
            <Row label="修改" value={report.diff.modified.join("、") || "无"} />
            <Row label="删除" value={report.diff.deleted.join("、") || "无"} />
          </dl>
        ) : <Missing />}
      </EvidenceSection>

      <EvidenceSection title="Tool 与 Validator">
        {report ? (
          <>
            {report.tools.length ? report.tools.map((tool) => (
              <article className="creator-tool-card" key={tool.name}>
                <strong>{tool.displayName ?? tool.name}</strong>
                <span>风险：{tool.riskLevel} · 可用性：{tool.availability}</span>
                <span>权限：{tool.requiredPermissions.join("、") || "无"}</span>
                <span>副作用：{tool.sideEffects.join("、") || "无"}</span>
                <span>访问：读 {String(tool.access.read)} / 写 {String(tool.access.write)} / 破坏性 {String(tool.access.destructive)}</span>
              </article>
            )) : <p>工具：无</p>}
            {report.diagnostics.length ? (
              <ul>{report.diagnostics.map((item, index) => <li key={`${item.code}-${index}`}>{item.severity} · {item.message}</li>)}</ul>
            ) : <p>Validator：未返回问题</p>}
          </>
        ) : <Missing />}
      </EvidenceSection>

      <EvidenceSection title="Smoke Evidence">
        {report?.smokeEvidence ? report.smokeEvidence.map((item) => (
          <article className="creator-smoke-case" key={item.case.id}>
            <strong>{item.case.id} · {item.status}</strong>
            <span>输入：{item.case.input}</span>
            <span>期望：{item.case.expected}</span>
            <span>耗时：{item.durationMs} ms</span>
            {item.errorType ? <span>错误：{item.errorType} · {item.errorMessage ?? "未提供详情"}</span> : null}
          </article>
        )) : <Missing />}
      </EvidenceSection>

      <EvidenceSection title="审核历史">
        {submission.reviews.length ? (
          <div className="history-list">{submission.reviews.map((review, index) => (
            <article className="history-item" key={`${review.createdAt}-${index}`}>
              <strong>{review.decision}</strong>
              <p>{review.comment ?? "未填写评语"}</p>
              <time>{new Date(review.createdAt).toLocaleString("zh-CN")}</time>
            </article>
          ))}</div>
        ) : <Missing />}
      </EvidenceSection>
    </div>
  );
}

function EvidenceSection({ children, title }: { children: React.ReactNode; title: string }) {
  return <section className="creator-section"><h2>{title}</h2>{children}</section>;
}

function Row({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}

function Missing() { return <p className="skill-review-missing">{MISSING}</p>; }
