export interface EventEnvelope<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  event_id: string;
  event_type: string;
  aggregate_id: string;
  occurred_at: string;
  payload: TPayload;
  traceparent?: string;
}
