export { BlocklistModule } from './blocklist.module';
export { BlocklistService, type BlocklistView, type PolicyDecision } from './blocklist.service';
export { normaliseDomain, type DomainResult } from './domain';
export {
  decide,
  lookup,
  matches,
  normalize,
  parseRules,
  type Decision,
  type DecisionSource,
  type RuleSets,
} from './matching';
export {
  DEFAULT_SAFESEARCH_TEXT,
  SAFESEARCH_MAP,
  parseMappings,
  safeSearchEntries,
  target,
  targets,
  type SafeSearchEntry,
} from './safesearch';
