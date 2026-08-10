// handle submissions--starts------

function formDataToObject(formData) {
  const obj = {};
  formData.forEach((value, key) => {
    obj[key] = value;
  });
  return obj;
}

// Generic function to handle form submissions
const handleFormSubmit = async (event, url) => {
  event.preventDefault();

  const form = event.target;
  const clickedButtonValue = event.submitter?.value;

  // Convert form fields to plain object
  const payload = {};
  new FormData(form).forEach((value, key) => {
    payload[key] = value;
  });

  // add submit button value if needed
  if (clickedButtonValue) {
    payload.submit = clickedButtonValue;
  }

  console.log("Submitting to URL:", url, "with data:", payload);

  const confirmationResult = await Swal.fire({
    title: "Confirm Submission",
    text: "Are you sure you want proceed?",
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "Yes!",
    cancelButtonText: "No!",
  });

  if (!confirmationResult.isConfirmed) return;

  document.getElementById("loader0").style.display = "block";

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    document.getElementById("loader0").style.display = "none";

    console.log("Response data:", data);

    if (!response.ok) {
      throw new Error(data.message || "Request failed");
    }

    Swal.fire({
      title: data.title || "Success",
      text: data.message || "Operation completed",
      icon: data.icon || "success",
      confirmButtonText: "OK",
    }).then((result) => {
      if (result.isConfirmed && data.redirect) {
        window.location.href = data.redirect;
      }
    });

  } catch (error) {
    document.getElementById("loader0").style.display = "none";
    console.error("Fetch error:", error);

    Swal.fire({
      title: "Error",
      text: error.message,
      icon: "error",
    });
  }
};


// Attach event listeners to each form, passing the appropriate endpoint URL
document.addEventListener("DOMContentLoaded", function () {
  const loginForm = document.getElementById("loginForm");
  if (loginForm) {
    loginForm.addEventListener("submit", function (e) {
      handleFormSubmit(e, "/user/login");
    });
  }

  const adminLoginForm = document.getElementById("adminLoginForm");
  if (adminLoginForm) {
    adminLoginForm.addEventListener("submit", function (e) {
      handleFormSubmit(e, "/admin");
    });
  }

  const backbtn = document.getElementById("backbtn");
  if (backbtn) {
    backbtn.addEventListener("click", function (e) {
      e.preventDefault();
      window.history.back();
    });
  }


  loaderHideFunc();
});
// handle submissions--ends------

// home page loader start
const loader = document.getElementById("loader");
function loaderHideFunc() {
  loader.style.display = "none";
}
// home page loader stop

// ---------------------------------------------------------------------------

// User logout
// Attach event listeners to each form, passing the appropriate endpoint URL

async function handleUserogout(event, url) {
  event.preventDefault(); // Prevent the default form submission

  // First, show confirmation before submitting the data
  const confirmationResult = await Swal.fire({
    title: "Confirm Submission",
    text: "Are you sure you want proceed?",
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "Yes!",
    cancelButtonText: "No!",
  });

  if (!confirmationResult.isConfirmed) {
    // If the user cancels, exit the function
    return;
  }

  fetch(url, {
    // Send the FormData object to the specified route
    method: "POST",
  })
    .then((response) => response.json())
    .then((data) => {
      console.log(data);
      if (data) {
        Swal.fire({
          title: data.title,
          text: data.message,
          confirmButtonText: "OK",

          icon: data.icon,
        }).then((result) => {
          /* Read more about isConfirmed, isDenied below */
          if (result.isConfirmed) {
            window.location.reload();
          }
        });
      } // Handle the response data
    })
    .catch((error) => {
      console.error("Error:", error); // Handle any errors
    });
}
