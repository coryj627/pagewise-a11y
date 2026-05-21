// Options page entrypoint. See architecture.md §10.1, §10.4, §10.9.
import { ChromeStorageBackend } from '@/shared/storage';
import { ChromePermissionsApi } from '@/shared/permissions';
import { DomainStore } from '@/shared/domain-store';
import { mountOptionsUi } from './ui';

const storage = new ChromeStorageBackend(chrome.storage.local);
const permissions = new ChromePermissionsApi();
const store = new DomainStore(storage, permissions);

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    mountOptionsUi(document, store);
  });
} else {
  mountOptionsUi(document, store);
}
