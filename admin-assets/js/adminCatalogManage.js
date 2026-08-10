

document.addEventListener("DOMContentLoaded", function () {
  // Apply Search
  const applyBtn = document.getElementById("applySearchBtn");
  if (applyBtn) {
    applyBtn.addEventListener("click", () => applySearch());
  }

  // Sorting
  const sortLinks = document.querySelectorAll(".sort-link");
  sortLinks.forEach(link => {
    link.addEventListener("click", e => {
      e.preventDefault();
      const field = link.getAttribute("data-field");
      sortTable(field);
    });
  });

  const tbody = document.querySelector("tbody");
  if (!tbody) return;

  // Single change handler for checkboxes (visibility & edit mode)
  tbody.addEventListener("change", async function (event) {
    const target = event.target;
    if (!(target instanceof Element)) return;

    if (target.classList.contains("btn-delist")) {
      await handleVisibilityChange(target);
      return;
    }

    if (target.classList.contains("btn-edit")) {
      await handleEditModeChange(target);
      return;
    }
  });

  // Single click handler for delete buttons (or clickable elements)
  tbody.addEventListener("click", async function (event) {
    const target = event.target;
    if (!(target instanceof Element)) return;

    if (target.classList.contains("btn-delete")) {
      await handleDeleteClick(target);
    }
  });

  /* ------------------ Helper functions ------------------ */

  // Generic confirmation dialog wrapper that returns true if confirmed
  function confirmDialog({ title, text, confirmButtonText }) {
    return Swal.fire({
      title: title,
      text: text,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: confirmButtonText,
    }).then(result => result.isConfirmed);
  }

  // Generic JSON fetch helper
  async function sendJson(url, method, bodyObj) {
    const resp = await fetch(url, {
      method: method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bodyObj),
    });
    return resp.json();
  }

  // Uniform response handling + success alert + reload
  async function handleResponse(response, successMessage, button, previousState) {
    if (response && response.success) {
      await Swal.fire("Updated!", successMessage, "success");
      location.reload();
    } else {
      // show error and revert UI state
      await Swal.fire("Error!", "There was an error updating.", "error");
      if (button && typeof previousState !== "undefined") {
        button.checked = previousState;
      }
    }
  }

  // Visibility change handler
  async function handleVisibilityChange(button) {
    const isChecked = button.checked;
    const id = button.getAttribute("data-id");
    const title = isChecked ? "Are you sure?" : "Are you sure to?";
    const text = isChecked ? "List again in catalog?!" : "Delist from catalog?!";
    const confirmButtonText = isChecked ? "Yes, list it!" : "Yes, delist it!";

    const userConfirmed = await confirmDialog({ title, text, confirmButtonText });

    if (!userConfirmed) {
      button.checked = !isChecked; // revert
      return;
    }

    try {
      const data = await sendJson("/admin/visibility", "POST", { id: id, visibility: isChecked });
      await handleResponse(data, "Visibility Updated!", button, !isChecked);
    } catch (err) {
      console.error(err);
      await Swal.fire("Error!", "There was an error Updating Visibility!" );
      button.checked = !isChecked; // revert
    }
  }

  // Edit mode change handler
  async function handleEditModeChange(button) {
    const isChecked = button.checked;
    const id = button.getAttribute("data-id");
    const title = isChecked ? "Are you sure?" : "Are you sure to?";
    const text = isChecked ? "Enable Edit Mode?!" : "Edit Mode Disabled?!";
    const confirmButtonText = isChecked ? "Yes, Enable!" : "Yes, Disable!";

    const userConfirmed = await confirmDialog({ title, text, confirmButtonText });

    if (!userConfirmed) {
      button.checked = !isChecked;
      return;
    }

    try {
      const data = await sendJson("/admin/editmode", "POST", { id: id, edit_mode: isChecked });
      await handleResponse(data, "Edit Mode Updated!", button, !isChecked);
    } catch (err) {
      console.error(err);
      await Swal.fire("Error!", "There was an error Updating Edit!");
      button.checked = !isChecked; // revert
    }
  }

  // Delete click handler
  async function handleDeleteClick(button) {
    // note: for non-checkbox delete triggers, button.checked may be undefined - keep original revert logic safe
    const prevChecked = typeof button.checked !== "undefined" ? button.checked : undefined;

    const file_name = button.getAttribute("file-name");
    const store = button.getAttribute("file-store");
    const file_type = button.getAttribute("file-type");
    const theme = button.getAttribute("file-theme");

    const title = "Are you sure to?";
    const text = "Delete Permanently?";
    const confirmButtonText = "Yes, Proceed..!";

    const userConfirmed = await confirmDialog({ title, text, confirmButtonText });

    if (!userConfirmed) {
      if (typeof prevChecked !== "undefined") button.checked = prevChecked;
      return;
    }

    try {
      const data = await sendJson("/admin/delete", "POST", { file_name, file_type, store, theme });
      if (data && data.success) {
        await Swal.fire("Updated!", "The file has been deleted.", "success");
        location.reload();
      } else {
        await Swal.fire("Error!", data || "There was an error deleting the file.", "error");
        if (typeof prevChecked !== "undefined") button.checked = prevChecked;
      }
    } catch (err) {
      console.error(err);
      await Swal.fire("Error!", "There was an error Deleting Files.");
      if (typeof prevChecked !== "undefined") button.checked = prevChecked;
    }
  }
});

  // *****************Update Edit mode ends*************


// *****************Appply sort start*************

function sortTable(field) {
  const searchData = document.getElementById("searchData");

  const currentSortField = searchData.dataset.sortField;
  const currentSortOrder = searchData.dataset.sortOrder;

  // Toggle only if same field, otherwise reset to ASC
  const newSortOrder =
    currentSortField === field && currentSortOrder === "ASC"
      ? "DESC"
      : "ASC";

  const searchField = document.getElementById("searchField").value || "";
  const searchValue = document.getElementById("searchValue").value || "";

  const url = `/admin/manage?page=1&sortField=${encodeURIComponent(
    field
  )}&sortOrder=${encodeURIComponent(
    newSortOrder
  )}&searchField=${encodeURIComponent(
    searchField
  )}&searchValue=${encodeURIComponent(searchValue)}`;

  console.log("Sorting URL:", url);
  window.location.href = url;
}

// *****************Appply sort ends*************


    // *****************Appply search start*************
function applySearch() {
  const searchField = document.getElementById("searchField").value || "";
  const searchValue = document.getElementById("searchValue").value || "";
  const sortField = "sn";
  const sortOrder = "ASC";
  const url = `/admin/manage?page=1&sortField=${encodeURIComponent(
sortField
)}&sortOrder=${encodeURIComponent(
sortOrder
)}&searchField=${encodeURIComponent(
searchField
)}&searchValue=${encodeURIComponent(searchValue)}`;
  console.log("Search URL:", url); // Debugging
  window.location.href = url;
}
// *****************Appply search ends*************

