import { useCallback, useEffect, useRef, useState } from 'react';
import type { OdmApi } from '../../lib/odm-api';
import type { DataMartSummary, RelationshipGraph } from '../../lib/odm-types';
import { buildSchemaIndex, type SchemaIndex } from '../../lib/schema-index';
import { describeError, type UserFacingError } from '../../lib/errors';

export interface LoadedSchema { index: SchemaIndex; graph: RelationshipGraph }

export type SchemaState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; error: UserFacingError }
  | ({ status: 'ready' } & LoadedSchema);

export async function loadSchema(api: OdmApi, mart: DataMartSummary): Promise<LoadedSchema> {
  const [schema, graph] = await Promise.all([api.getBlendableSchema(mart.id), api.getRelationshipGraph(mart.id)]);
  return { index: buildSchemaIndex({ id: mart.id, title: mart.title }, schema), graph };
}

export function useSchema(api: OdmApi, mart: DataMartSummary | undefined) {
  const cache = useRef(new Map<string, Promise<LoadedSchema>>());
  const [state, setState] = useState<SchemaState>({ status: 'idle' });
  const [attempt, setAttempt] = useState(0);

  const load = useCallback(
    (target: DataMartSummary) => {
      let pending = cache.current.get(target.id);
      if (!pending) {
        pending = loadSchema(api, target);
        cache.current.set(target.id, pending);
        pending.catch(() => cache.current.delete(target.id));
      }
      return pending;
    },
    [api],
  );

  useEffect(() => {
    if (!mart) {
      setState({ status: 'idle' });
      return;
    }
    let alive = true;
    setState({ status: 'loading' });
    load(mart).then(
      (loaded) => alive && setState({ status: 'ready', ...loaded }),
      (error) => alive && setState({ status: 'error', error: describeError(error, mart.title) }),
    );
    return () => {
      alive = false;
    };
  }, [mart, load, attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  return { state, load, reload };
}
