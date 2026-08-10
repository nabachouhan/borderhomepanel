// *****Event listener to publish layer geoserver***********
document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("adminCatalogForm");
  const fileNameSelect = document.getElementById("file_name");
  const titleId = document.getElementById("title");
  const file_type = document.getElementById("file_type");
  const theme = document.getElementById("theme");

  // ⛔ Prevent form submission
  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
    });
  }

  fileNameSelect.addEventListener("change", async () => {
    const fileName = fileNameSelect.value;
    if (!fileName) return;

    try {
      const response = await fetch(`/admin/catalog/${fileName}`);
      const result = await response.json();

      // 🔔 Backend message alert
      if (result.message) {
        Swal.fire({
          icon: result.icon || "info",
          title: "Message",
          text: result.message,
        });
        return;
      }

      // ✅ Success fill
      titleId.value = result.title || "";
      file_type.value = result.file_type || "";
      theme.value = result.theme || "";

      Swal.fire({
        icon: "success",
        title: "Success",
        text: "Catalog details loaded successfully!",
        timer: 1500,
        showConfirmButton: false,
      });

    } catch (error) {
      console.error(error);
      Swal.fire({
        icon: "error",
        title: "Error",
        text: "Failed to communicate with server.",
      });
    }
  });
});
// *****Event listener to publish layer geoserver***********
