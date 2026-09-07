import React, { useEffect, useState } from "react";
import axios from "axios";

const BACKEND_URL =
  process.env.REACT_APP_BACKEND_URL ||
  "https://tapash-saha-1.onrender.com";

export default function Attendance() {
  const [date, setDate] = useState(
    new Date().toISOString().split("T")[0]
  );

  const [students, setStudents] = useState([]);
  const [batches, setBatches] = useState([]);
  const [selectedBatch, setSelectedBatch] = useState("");
  const [attendance, setAttendance] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const getAuthHeaders = () => {
    const token =
      localStorage.getItem("token") ||
      localStorage.getItem("access_token");

    return token
      ? { Authorization: `Bearer ${token}` }
      : {};
  };

  useEffect(() => {
    loadBatches();
  }, []);

  useEffect(() => {
    if (selectedBatch) {
      loadStudents();
    } else {
      setStudents([]);
      setAttendance({});
    }
  }, [selectedBatch]);

  useEffect(() => {
    if (selectedBatch && date) {
      loadExistingAttendance();
    }
  }, [selectedBatch, date]);

  const loadBatches = async () => {
    try {
      const response = await axios.get(
        `${BACKEND_URL}/api/batches`,
        {
          headers: getAuthHeaders(),
        }
      );

      setBatches(response.data || []);
    } catch (error) {
      console.error("Error loading batches:", error);
      setMessage("Unable to load classes.");
    }
  };

  const loadStudents = async () => {
    setLoading(true);

    try {
      const response = await axios.get(
        `${BACKEND_URL}/api/students`,
        {
          headers: getAuthHeaders(),
        }
      );

      const allStudents = response.data || [];

      const filtered = allStudents.filter(
        (student) =>
          String(student.batch_id) === String(selectedBatch)
      );

      setStudents(filtered);

      const initial = {};

      filtered.forEach((student) => {
        initial[student.id] = "present";
      });

      setAttendance(initial);
    } catch (error) {
      console.error("Error loading students:", error);
      setMessage("Unable to load students.");
    } finally {
      setLoading(false);
    }
  };

  const loadExistingAttendance = async () => {
    try {
      const response = await axios.get(
        `${BACKEND_URL}/api/attendance`,
        {
          params: {
            date,
            app_class_id: String(selectedBatch),
          },
          headers: getAuthHeaders(),
        }
      );

      const existing = response.data || {};
      const updated = { ...attendance };

      existing.forEach((record) => {
        if (record.app_student_id) {
          updated[record.app_student_id] = record.status;
        }
      });

      setAttendance(updated);
    } catch (error) {
      console.error("Error loading attendance:", error);
    }
  };

  const setStudentStatus = (studentId, status) => {
    setAttendance((previous) => ({
      ...previous,
      [studentId]: status,
    }));
  };

  const saveAttendance = async () => {
    if (!selectedBatch) {
      setMessage("Please select a class first.");
      return;
    }

    if (!students.length) {
      setMessage("No students found in this class.");
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      const records = students.map((student) => ({
        app_student_id: String(student.id),
        app_class_id: String(selectedBatch),
        date,
        status: attendance[student.id] || "present",
      }));

      await axios.post(
        `${BACKEND_URL}/api/attendance/bulk`,
        { records },
        {
          headers: getAuthHeaders(),
        }
      );

      setMessage("Attendance saved successfully.");
    } catch (error) {
      console.error("Error saving attendance:", error);

      const detail =
        error?.response?.data?.detail ||
        "Unable to save attendance.";

      setMessage(detail);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Attendance</h1>
          <p style={styles.subtitle}>
            Mark today's student attendance
          </p>
        </div>
      </div>

      <div style={styles.controls}>
        <div style={styles.field}>
          <label style={styles.label}>Date</label>

          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            style={styles.input}
          />
        </div>

        <div style={styles.field}>
          <label style={styles.label}>Select Class</label>

          <select
            value={selectedBatch}
            onChange={(e) => setSelectedBatch(e.target.value)}
            style={styles.input}
          >
            <option value="">Select a class</option>

            {batches.map((batch) => (
              <option
                key={batch.id}
                value={batch.id}
              >
                {batch.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {message && (
        <div style={styles.message}>
          {message}
        </div>
      )}

      {loading ? (
        <div style={styles.empty}>
          Loading students...
        </div>
      ) : !selectedBatch ? (
        <div style={styles.empty}>
          Select a class to see students.
        </div>
      ) : students.length === 0 ? (
        <div style={styles.empty}>
          No students found in this class.
        </div>
      ) : (
        <>
          <div style={styles.list}>
            {students.map((student, index) => {
              const status =
                attendance[student.id] || "present";

              return (
                <div
                  key={student.id}
                  style={styles.studentRow}
                >
                  <div style={styles.studentInfo}>
                    <div style={styles.number}>
                      {index + 1}
                    </div>

                    <div>
                      <div style={styles.studentName}>
                        {student.name}
                      </div>

                      {student.phone && (
                        <div style={styles.phone}>
                          {student.phone}
                        </div>
                      )}
                    </div>
                  </div>

                  <div style={styles.buttons}>
                    <button
                      type="button"
                      onClick={() =>
                        setStudentStatus(
                          student.id,
                          "present"
                        )
                      }
                      style={{
                        ...styles.statusButton,
                        ...(status === "present"
                          ? styles.presentActive
                          : {}),
                      }}
                    >
                      Present
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setStudentStatus(
                          student.id,
                          "absent"
                        )
                      }
                      style={{
                        ...styles.statusButton,
                        ...(status === "absent"
                          ? styles.absentActive
                          : {}),
                      }}
                    >
                      Absent
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={saveAttendance}
            disabled={saving}
            style={styles.saveButton}
          >
            {saving ? "Saving..." : "Save Attendance"}
          </button>
        </>
      )}
    </div>
  );
}

const styles = {
  page: {
    padding: "24px",
    maxWidth: "1100px",
    margin: "0 auto",
  },

  header: {
    marginBottom: "24px",
  },

  title: {
    margin: 0,
    fontSize: "28px",
    fontWeight: 700,
  },

  subtitle: {
    marginTop: "6px",
    color: "#6b7280",
  },

  controls: {
    display: "flex",
    gap: "16px",
    flexWrap: "wrap",
    marginBottom: "20px",
  },

  field: {
    display: "flex",
    flexDirection: "column",
    gap: "7px",
    minWidth: "220px",
  },

  label: {
    fontSize: "14px",
    fontWeight: 600,
  },

  input: {
    padding: "11px 12px",
    border: "1px solid #d1d5db",
    borderRadius: "8px",
    background: "#fff",
    fontSize: "15px",
  },

  message: {
    padding: "12px 14px",
    marginBottom: "16px",
    borderRadius: "8px",
    background: "#f3f4f6",
  },

  empty: {
    padding: "40px 20px",
    textAlign: "center",
    color: "#6b7280",
  },

  list: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },

  studentRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "16px",
    padding: "14px",
    border: "1px solid #e5e7eb",
    borderRadius: "10px",
    background: "#fff",
  },

  studentInfo: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
  },

  number: {
    width: "32px",
    height: "32px",
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#f3f4f6",
    fontWeight: 600,
  },

  studentName: {
    fontWeight: 600,
  },

  phone: {
    fontSize: "13px",
    color: "#6b7280",
    marginTop: "3px",
  },

  buttons: {
    display: "flex",
    gap: "8px",
  },

  statusButton: {
    padding: "9px 14px",
    border: "1px solid #d1d5db",
    borderRadius: "7px",
    background: "#fff",
    cursor: "pointer",
    fontWeight: 600,
  },

  presentActive: {
    background: "#dcfce7",
    borderColor: "#22c55e",
  },

  absentActive: {
    background: "#fee2e2",
    borderColor: "#ef4444",
  },

  saveButton: {
    marginTop: "22px",
    width: "100%",
    padding: "13px 18px",
    border: "none",
    borderRadius: "8px",
    background: "#6c55f5",
    color: "#fff",
    fontSize: "16px",
    fontWeight: 700,
    cursor: "pointer",
  },
};
