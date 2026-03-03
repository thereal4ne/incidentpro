import { render, screen } from "@testing-library/react";
import AttachmentSection from "../components/AttachmentSection";

test("renders attachments heading", () => {
  render(
    <AttachmentSection
      incidentId={1}
      token="fake-token"
      userRole="ADMIN"
    />
  );

  const heading = screen.getByText(/Attachments/i);
  expect(heading).toBeInTheDocument();
});