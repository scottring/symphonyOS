// src/shell/ShellSearch.tsx
//
// Global search (⌘/). Self-contained so it only subscribes to data while open:
// fetches tasks/projects/contacts/routines/lists, runs useSearch, and renders the
// SearchModal. Selecting a result opens it (task/routine via the global detail
// panel; project/contact/list via navigation). Mounted only when open.

import { useSupabaseTasks } from '@/hooks/useSupabaseTasks';
import { useProjects } from '@/hooks/useProjects';
import { useContacts } from '@/hooks/useContacts';
import { useRoutines } from '@/hooks/useRoutines';
import { useListsContext } from '@/contexts/ListsContext';
import { useSearch, type SearchResult } from '@/hooks/useSearch';
import { SearchModal } from '@/components/search';
import { useSearchNavigation } from './useSearchNavigation';

export function ShellSearch({ onClose }: { onClose: () => void }) {
  const { tasks } = useSupabaseTasks();
  const { projects } = useProjects();
  const { contacts } = useContacts();
  const { routines } = useRoutines();
  const { lists } = useListsContext();
  const openResult = useSearchNavigation();

  const { query, setQuery, results, totalResults, isSearching, clearSearch } = useSearch({
    tasks, projects, contacts, routines, lists,
  });

  const close = () => { clearSearch(); onClose(); };

  const handleSelect = (result: SearchResult) => {
    close();
    openResult(result, tasks);
  };

  return (
    <SearchModal
      isOpen
      onClose={close}
      query={query}
      onQueryChange={setQuery}
      results={results}
      totalResults={totalResults}
      isSearching={isSearching}
      onSelectResult={handleSelect}
    />
  );
}
