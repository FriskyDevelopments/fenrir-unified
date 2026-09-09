import { useEffect, useRef, useState, type FormEvent } from "react";
import { DNS_RECORD_TYPES, matchesExpectedDnsRecord, normalizeDnsName, type DnsLookupQuery, type DnsLookupResult, type DnsRecordType } from "../../shared/dns-lookup";
import type { Copy, Locale } from "../i18n";
import { fetchDnsLookup } from "../services/dnsLookup";
import type { FriskyDomain } from "../services/types";

type ExpectedRecord = { type: "CNAME" | "TXT"; name: string; value: string };

function expectedRecords(selected?: FriskyDomain | null): ExpectedRecord[] {
  if (!selected) return [];
  return [
    { type: "CNAME", name: selected.cnameHost, value: selected.cnameTarget },
    { type: "TXT", name: selected.txtRecordName, value: selected.txtRecordValue },
  ].filter((record) => normalizeDnsName(record.name) && record.value) as ExpectedRecord[];
}

function querySignature(query: DnsLookupQuery): string {
  return JSON.stringify([query.status, query.records.map((record) => `${record.name.toLowerCase().replace(/\.$/, "")}|${record.type}|${record.data}`).sort()]);
}

export function DnsLookupPanel({ selected, c, locale }: { selected?: FriskyDomain | null; c: Copy; locale: Locale }) {
  const [domain, setDomain] = useState("");
  const [type, setType] = useState<DnsRecordType | "ALL">("ALL");
  const [result, setResult] = useState<DnsLookupResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [expected, setExpected] = useState<ExpectedRecord | null>(null);
  const request = useRef<AbortController | null>(null);
  const version = useRef(0);

  useEffect(() => () => { version.current++; request.current?.abort(); }, []);
  useEffect(() => { setExpected(null); }, [selected?.id]);

  function clearResult() {
    version.current++;
    request.current?.abort();
    setBusy(false); setResult(null); setError(""); setExpected(null);
  }

  async function runLookup(name: string, queryType: DnsRecordType | "ALL", comparison: ExpectedRecord | null = null) {
    request.current?.abort();
    const currentVersion = ++version.current;
    const normalized = normalizeDnsName(name);
    setResult(null); setError(""); setExpected(comparison);
    if (!normalized) { setError(c.dnsLookupInvalid); setBusy(false); return; }
    setDomain(normalized); setType(queryType); setBusy(true);
    const controller = new AbortController();
    request.current = controller;
    try {
      const response = await fetchDnsLookup(normalized, queryType, controller.signal);
      if (version.current === currentVersion && !controller.signal.aborted) setResult(response);
    } catch (cause) {
      if (version.current !== currentVersion || controller.signal.aborted) return;
      const code = cause instanceof Error ? cause.message : "";
      setError(code === "authentication_required" ? c.dnsLookupAuth : code === "invalid_dns_query" ? c.dnsLookupInvalid : c.dnsLookupUnavailable);
    } finally { if (version.current === currentVersion) setBusy(false); }
  }

  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void runLookup(domain, type); }
  const queries = result?.resolvers.flatMap((resolver) => resolver.queries) ?? [];
  const failureCount = queries.filter((query) => query.status === "resolver_error").length;
  const disagreement = DNS_RECORD_TYPES.some((recordType) => {
    const comparable = result?.resolvers.map((resolver) => resolver.queries.find((query) => query.type === recordType)).filter((query): query is DnsLookupQuery => !!query && query.status !== "resolver_error") ?? [];
    return new Set(comparable.map(querySignature)).size > 1;
  });
  const records = expectedRecords(selected);
  const statusText = (query: DnsLookupQuery) => ({ records: c.dnsLookupRecords, no_records: c.dnsLookupNoRecords, nxdomain: c.dnsLookupNxdomain, resolver_error: c.dnsLookupResolverError })[query.status];

  return <section className="dns-lookup-panel" aria-labelledby="dns-lookup-title">
    <div className="dns-lookup-header">
      <div><p className="label">DNS-WIZARD</p><h3 id="dns-lookup-title">{c.dnsLookupTitle}</h3><p>{c.dnsLookupBody}</p></div>
      <span className="status blue">{c.dnsLookupReadOnly}</span>
    </div>
    <form className="dns-lookup-form" onSubmit={submit}>
      <label>{c.dnsLookupName}<input value={domain} placeholder="_dmarc.example.com" maxLength={253} autoCapitalize="none" autoCorrect="off" spellCheck={false} onChange={(event) => { clearResult(); setDomain(event.target.value); }} /></label>
      <label>{c.dnsLookupType}<select value={type} onChange={(event) => { clearResult(); setType(event.target.value as DnsRecordType | "ALL"); }}><option value="ALL">{c.dnsLookupAll}</option>{DNS_RECORD_TYPES.map((recordType) => <option key={recordType} value={recordType}>{recordType}</option>)}</select></label>
      <button disabled={busy || !domain.trim()} type="submit">{busy ? c.dnsLookupBusy : c.dnsLookupRun}</button>
    </form>
    {selected && <div className="dns-lookup-quick"><span>{c.dnsLookupSelected}</span><button className="secondary compact-button" type="button" disabled={busy} onClick={() => void runLookup(selected.domain, "ALL")}>{selected.domain}</button>{records.map((record) => <button className="secondary compact-button" type="button" key={record.type} disabled={busy} onClick={() => void runLookup(record.name, record.type, record)}>{record.type} · {record.name}</button>)}</div>}
    <p className="dns-lookup-boundary">{c.dnsLookupBoundary}</p>
    <div aria-live="polite" aria-busy={busy}>
      {error && <p role="alert" className="status danger">{error}</p>}
      {result && <>
        <div className="dns-lookup-summary"><b>{result.domain}</b><time dateTime={result.checkedAt}>{c.dnsLookupChecked}: {new Date(result.checkedAt).toLocaleString(locale)}</time></div>
        {failureCount > 0 && <p className="dns-lookup-warning">{failureCount === queries.length ? c.dnsLookupUnavailable : c.dnsLookupPartial}</p>}
        {disagreement && <p className="dns-lookup-warning">{c.dnsLookupDisagreement}</p>}
        {expected && <p className="dns-lookup-expected">{c.dnsLookupExpected}: <code>{expected.type} {expected.name} → {expected.value}</code></p>}
        <div className="dns-lookup-resolvers">{result.resolvers.map((resolver) => <article className="dns-lookup-resolver" key={resolver.id}>
          <h4>{resolver.name}</h4>
          {resolver.queries.map((query) => <div className="dns-lookup-query" key={query.type}>
            <div className="dns-lookup-query-head"><b>{query.type}</b><span className={`status ${query.status === "records" ? "blue" : "amber"}`}>{statusText(query)}</span>{query.rcode !== null && <small>RCODE {query.rcode}</small>}</div>
            {query.error && <p>{query.error === "timeout" ? c.dnsLookupTimeout : c.dnsLookupRetry}</p>}
            {query.records.map((record, index) => <div className="dns-lookup-answer" key={`${record.name}-${index}`}><code>{record.name}</code><code>{record.data}</code><small>TTL {record.ttl} s</small></div>)}
            {query.aliases.length > 0 && <details><summary>{c.dnsLookupAliases}</summary>{query.aliases.map((alias, index) => <div className="dns-lookup-answer" key={index}><code>{alias.name} CNAME {alias.data}</code><small>TTL {alias.ttl} s</small></div>)}</details>}
            {expected && query.type === expected.type && query.status !== "resolver_error" && <p className="dns-lookup-comparison">{query.records.some((record) => matchesExpectedDnsRecord(record, expected.type, expected.name, expected.value)) ? c.dnsLookupMatch : c.dnsLookupNoMatch}</p>}
          </div>)}
        </article>)}</div>
      </>}
    </div>
  </section>;
}
