import { useEffect } from 'react';
import { Route, Routes } from 'react-router-dom';
import { ErrorBox, FocusLayout, NavLayout } from './components/ui.tsx';
import { Home } from './pages/Home.tsx';
import { RecordPage } from './pages/Record.tsx';
import { Recipes } from './pages/Recipes.tsx';
import { Search } from './pages/Search.tsx';
import { RecipePage } from './pages/RecipePage.tsx';
import { Cook } from './pages/Cook.tsx';
import { EditRecipe, NewRecipe } from './pages/EditRecipe.tsx';

const APP_NAME = "Amma's Recipe Book";

export function App() {
  useEffect(() => {
    document.title = APP_NAME;
    void navigator.storage?.persist?.(); // ask the phone not to clear our data when it is short of space
  }, []);

  return (
    <Routes>
      <Route element={<NavLayout />}>
        <Route path="/" element={<Home appName={APP_NAME} />} />
        <Route path="/recipes" element={<Recipes />} />
        <Route path="/search" element={<Search />} />
      </Route>
      <Route element={<FocusLayout />}>
        <Route path="/record" element={<RecordPage />} />
        <Route path="/record/:id" element={<RecordPage />} />
        <Route path="/recipes/new" element={<NewRecipe />} />
        <Route path="/recipes/:id" element={<RecipePage />} />
        <Route path="/recipes/:id/edit" element={<EditRecipe />} />
        <Route path="/recipes/:id/cook" element={<Cook />} />
        <Route path="*" element={<ErrorBox message="I couldn't find that page." />} />
      </Route>
    </Routes>
  );
}
