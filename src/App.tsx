import { BrowserRouter, Routes, Route } from "react-router-dom";
import Dashboard from "./pages/Dashboard";

const routerFuture = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
};

function App() {
  return (
    <BrowserRouter future={routerFuture}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
