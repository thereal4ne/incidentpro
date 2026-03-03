import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App';

test('renders login page when not authenticated', () => {
  render(
    <MemoryRouter initialEntries={["/"]}>
      <App />
    </MemoryRouter>
  );

  // 1. Specifically look for the Heading (h1) with text LOGIN
  const loginHeader = screen.getByRole('heading', { name: /LOGIN/i });
  expect(loginHeader).toBeInTheDocument();
  
  // 2. Specifically look for the Button with text Login
  const loginButton = screen.getByRole('button', { name: /^login$/i });
  expect(loginButton).toBeInTheDocument();

  // 3. Check for the input fields to be thorough
  expect(screen.getByPlaceholderText(/Username/i)).toBeInTheDocument();
  expect(screen.getByPlaceholderText(/Password/i)).toBeInTheDocument();
});