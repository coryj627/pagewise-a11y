// Options page entrypoint. See architecture.md §10.1, §10.4, §10.9.
import { ChromeStorageBackend } from '@/shared/storage';
import { ChromePermissionsApi } from '@/shared/permissions';
import { DomainStore } from '@/shared/domain-store';
import { CostLedger } from '@/shared/cost-ledger';
import { mountOptionsUi } from './ui';

const storage = new ChromeStorageBackend(chrome.storage.local);
const permissions = new ChromePermissionsApi();
const services = {
  domains: new DomainStore(storage, permissions),
  ledger: new CostLedger(storage),
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    mountOptionsUi(document, services);
  });
} else {
  mountOptionsUi(document, services);
}
