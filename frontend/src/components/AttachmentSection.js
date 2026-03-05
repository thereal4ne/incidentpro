import React, { useEffect, useState } from "react";
import axios from "axios";
import API from "../config";

function formatFileSize(size) {
  if (size < 1024) return size + " B";
  if (size < 1024 * 1024) return (size / 1024).toFixed(1) + " KB";
  return (size / (1024 * 1024)).toFixed(2) + " MB";
}

function getFileIcon(type) {
  if (type?.includes("image")) return "🖼";
  if (type?.includes("pdf")) return "📄";
  if (type?.includes("zip")) return "🗜";
  if (type?.includes("text")) return "📝";
  return "📁";
}



export default function AttachmentSection({ incidentId, token, userRole }) {
  const [attachments, setAttachments] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedImage, setSelectedImage] = useState(null);

  useEffect(() => {
    fetchAttachments();
  }, []);

  const fetchAttachments = async () => {
    const res = await axios.get(
      `${API}/api/incidents/${incidentId}/attachments/`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    setAttachments(res.data);
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      alert("Please select a file first");
      return;
    }

    const formData = new FormData();
    formData.append("file", selectedFile);

    await axios.post(
      `${API}/api/incidents/${incidentId}/attachments/upload/`,
      formData,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "multipart/form-data",
        },
      }
    );

    setSelectedFile(null);
    fetchAttachments();
  };

  const handleDownload = (id) => {
    window.open(
      `${API}/api/incidents/${incidentId}/attachments/${id}/download/`,
      "_blank"
    );
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this attachment?"))
      return;

    await axios.delete(
      `${API}/api/incidents/${incidentId}/attachments/${id}/delete/`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    fetchAttachments();
  };

  return (
    <div className="mt-4">
      <h5>Attachments ({attachments.length})</h5>

      {/* ===== UPLOAD SECTION ===== */}
      <div className="mb-3 p-3 border rounded">
        <div className="d-flex gap-2">
          <input
            type="file"
            className="form-control"
            onChange={(e) => setSelectedFile(e.target.files[0])}
          />
          <button
            className="btn btn-primary"
            onClick={handleUpload}
          >
            Upload
          </button>
        </div>
      </div>

      {/* ===== ATTACHMENT LIST ===== */}
      <div className="row">
        {attachments.map((a) => (
          <div className="col-md-4 mb-3" key={a.id}>
            <div className="card shadow-sm p-3">
              <div style={{ fontSize: "40px" }}>
                {getFileIcon(a.file_type)}
              </div>

              <h6 className="mt-2">{a.original_filename}</h6>

              <small className="text-muted">
                {formatFileSize(a.file_size)} • {a.file_type}
              </small>

              <br />

              <small>
                Uploaded by: <b>{a.uploaded_by}</b>
              </small>

              <br />

              <small className="text-muted">
                {a.uploaded_at}
              </small>

              <div className="mt-2 d-flex justify-content-between">
                <button
                  className="btn btn-sm btn-outline-primary"
                  onClick={() => handleDownload(a.id)}
                >
                  Download
                </button>

                {userRole === "ADMIN" && (
                  <button
                    className="btn btn-sm btn-outline-danger"
                    onClick={() => handleDelete(a.id)}
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ===== IMAGE PREVIEW MODAL ===== */}
      {selectedImage && (
        <div
          className="modal show d-block"
          onClick={() => setSelectedImage(null)}
        >
          <div className="modal-dialog modal-lg">
            <div className="modal-content p-3">
              <img
                src={selectedImage}
                style={{ width: "100%" }}
                alt="Preview"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}