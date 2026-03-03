import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import App from "../App";
import { MemoryRouter } from "react-router-dom";
import "@testing-library/jest-dom";

/* =========================
   Mock localStorage
========================= */
beforeEach(() => {
  const localStorageMock = {
    getItem: jest.fn((key) =>
      key === "access_token" ? "fake_token" : null
    ),
    setItem: jest.fn(),
    clear: jest.fn(),
    removeItem: jest.fn(),
  };

  Object.defineProperty(window, "localStorage", {
    value: localStorageMock,
    writable: true,
  });
});

afterEach(() => {
  jest.resetAllMocks();
});

/* =========================
   Universal fetch mock helper
========================= */
const mockFetch = (userRole = "ADMIN", incidents = []) => {
  global.fetch = jest.fn((url) => {
    if (url.includes("/api/current_user/")) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            username: userRole.toLowerCase(),
            role: userRole,
          }),
      });
    }

    if (url.includes("/api/incidents/")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(incidents),
      });
    }

    if (url.includes("/api/users/")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([]),
      });
    }

    // 🔥 Important: Always return a default response
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve([]),
    });
  });
};

/* =========================
   Tests
========================= */

describe("Dashboard Component", () => {
  test("renders Dashboard and checks for logo and admin role", async () => {
    const incidents = [
      {
        id: 1,
        title: "Critical Bug",
        description: "Desc",
        priority: "CRITICAL",
        status: "OPEN",
        assigned_to: "admin",
      },
    ];

    mockFetch("ADMIN", incidents);

    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>
    );

    const logo = await screen.findByText(/IncidentPro/i);
    expect(logo).toBeInTheDocument();

    expect(
      await screen.findByText(/admin\s*\(ADMIN\)/i)
    ).toBeInTheDocument();

    expect(
      await screen.findByText(/Critical Bug/i)
    ).toBeInTheDocument();
  });

  test("Logout button functionality", async () => {
    mockFetch("ADMIN", []);

    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>
    );

    const logoutBtn = await screen.findByText(/Logout/i);
    fireEvent.click(logoutBtn);

    expect(localStorage.clear).toHaveBeenCalled();
  });

  test("displays ADMIN role correctly", async () => {
    mockFetch("ADMIN", []);

    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>
    );

    expect(
      await screen.findByText(/admin\s*\(ADMIN\)/i)
    ).toBeInTheDocument();
  });

  test("displays EMPLOYEE role correctly", async () => {
    mockFetch("EMPLOYEE", []);

    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>
    );

    expect(
      await screen.findByText(/employee\s*\(EMPLOYEE\)/i)
    ).toBeInTheDocument();
  });
});