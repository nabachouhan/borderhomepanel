
// *********** Admin upload form handele dynamic elemets starts**********
document.addEventListener("DOMContentLoaded", () => {

  const fileNameSelect = document.getElementById("meta_file_name");
  const fileIdInput = document.getElementById("spatial_coverage");
  const themeselect = document.getElementById("meta-theme");
  const filetypeselect = document.getElementById("meta-filetype");


  const title = document.getElementById("title");
  const publisher = document.getElementById("publisher");
  const public_access_level = document.getElementById("public_access_level");
  const citation = document.getElementById("citation");
  const source_date = document.getElementById("source_date");
  const group_visibility = document.getElementById("group_visibility");
  const data_abstract = document.getElementById("data_abstract");
  const area_of_interest = document.getElementById("area_of_interest");
  const metadata_date = document.getElementById("metadata_date");
  const year_category = document.getElementById("year_category");
  const data_quality = document.getElementById("data_quality");
  const language = document.getElementById("language");
  const projection = document.getElementById("projection");
  const scale = document.getElementById("scale");


  document.getElementById("metadata_date").value = new Date().toISOString().split('T')[0]

  fileNameSelect.addEventListener("change", async () => {
    const fileName = fileNameSelect.value;

    if (fileName) {
      try {
        const response = await fetch(`/admin/catalog/${fileName}`);
        if (response.ok) {
          const data = await response.json();
          console.log(data);

          fileIdInput.value = data.bbox;
          themeselect.value = data.theme;
          filetypeselect.value = data.file_type;

          title.value = data.title;
          publisher.value = data.publisher;
          public_access_level.value = data.public_access_level;
          citation.value = data.citation;
          year_category.value = data.year_category;
          source_date.value = data.source_date.split('T')[0];
          data_abstract.value = data.data_abstract;
          group_visibility.value = data.group_visibility;
          area_of_interest.value = data.area_of_interest;
          metadata_date.value = data.metadata_date.split('T')[0];
          data_quality.value = data.data_quality;
          language.value = data.language;
          projection.value = data.projection;
          scale.value = data.scale;

        } else {
          console.error("File not found");
          fileIdInput.value = "";
        }
      } catch (error) {
        console.error("Error fetching item details:", error);
      }
    } else {
      fileIdInput.value = "";
    }
  });
});
// *********** Admin upload form handele dynamic elemets ends**********

//************ */ upload form meta data
const steps = document.querySelectorAll('.form-step');
const nextButtons = document.querySelectorAll('.next-btn');
const prevButtons = document.querySelectorAll('.prev-btn');
const progressBar = document.querySelector('.progress-bar');
let currentStep = 0;
// update steps
function updateStep() {
  steps.forEach((step, index) => {
    step.classList.toggle('active', index === currentStep);
  });
  progressBar.style.width = `${(currentStep + 1) * 33.33}%`;
  progressBar.textContent = `Step ${currentStep + 1}`;
}

nextButtons.forEach(button => {
  button.addEventListener('click', () => {
    if (currentStep < steps.length - 1) {
      currentStep++;
      updateStep();
    }
  });
});

prevButtons.forEach(button => {
  button.addEventListener('click', () => {
    if (currentStep > 0) {
      currentStep--;
      updateStep();
    }
  });
});

// Thumbnail preview
const thumbnailInput = document.getElementById('thumbnail');
const thumbnailPreview = document.getElementById('thumbnailPreview');
thumbnailInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) {
    thumbnailPreview.src = URL.createObjectURL(file);
    thumbnailPreview.style.display = 'block';
  } else {
    thumbnailPreview.style.display = 'none';
  }
});

// Submit handler
document.querySelector('.submit-btn').addEventListener('click', () => {
  alert('Form submitted successfully!');
  // Add actual form submission logic here
});

// ---------------------

