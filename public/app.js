document.addEventListener('DOMContentLoaded', () => {
  const memberForm = document.getElementById('memberForm');
  const searchInput = document.getElementById('searchInput');
  const membersTableBody = document.getElementById('membersTableBody');
  const registrationCard = document.getElementById('registrationCard');
  const authStatusArea = document.getElementById('authStatusArea');
  
  const loginModal = document.getElementById('loginModal');
  const passwordModal = document.getElementById('passwordModal');
  const loginForm = document.getElementById('loginForm');
  const changePasswordForm = document.getElementById('changePasswordForm');
  
  let isAdminLoggedIn = false;
  let isEditing = false;
  let editingRegNo = null;

  // --- 1. CHECK AUTH STATUS ---
  async function checkAuthStatus() {
    try {
      const response = await fetch('/api/check-auth');
      const result = await response.json();
      
      isAdminLoggedIn = result.isAdmin;
      updateUiForAuth(result.isAdmin, result.adminName);
      loadMembers(searchInput ? searchInput.value : '');
    } catch (err) {
      console.error('Auth Check Error:', err);
      // Fallback UI if backend session route fails
      updateUiForAuth(false);
      loadMembers();
    }
  }

  function updateUiForAuth(loggedIn, adminName = '') {
    if (!authStatusArea) return;

    if (loggedIn) {
      if (registrationCard) registrationCard.style.display = 'block';
      authStatusArea.innerHTML = `
        <span class="welcome-msg" style="color:white; margin-right:10px;">Welcome, <strong>${adminName || 'Admin'}</strong></span>
        <button id="openPasswordModalBtn" class="btn-sm" style="margin-right:5px;">Change Password</button>
        <button id="logoutBtn" class="btn-sm btn-danger">Logout</button>
      `;

      document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'table-cell');

      document.getElementById('logoutBtn').addEventListener('click', handleLogout);
      document.getElementById('openPasswordModalBtn').addEventListener('click', () => {
        if (passwordModal) passwordModal.style.display = 'block';
      });
    } else {
      if (registrationCard) registrationCard.style.display = 'none';
      authStatusArea.innerHTML = `
        <button id="openLoginModalBtn" class="btn-sm btn-primary" style="padding:6px 12px; font-weight:bold; cursor:pointer;">Admin Login</button>
      `;

      document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');

      document.getElementById('openLoginModalBtn').addEventListener('click', () => {
        if (loginModal) loginModal.style.display = 'block';
      });
    }
  }

  // --- 2. LOAD MEMBERS ---
  async function loadMembers(searchTerm = '') {
    try {
      const response = await fetch(`/api/members?search=${encodeURIComponent(searchTerm)}`);
      const result = await response.json();

      if (result.success) {
        renderTable(result.data);
      }
    } catch (err) {
      console.error('Error fetching members:', err);
    }
  }

  function renderTable(members) {
    if (!membersTableBody) return;

    // --- CALCULATE GENDER STATISTICS ---
    const totalCount = members ? members.length : 0;
    const maleCount = members ? members.filter(m => m.gender === 'Male').length : 0;
    const femaleCount = members ? members.filter(m => m.gender === 'Female').length : 0;

    // Update DOM
    const statTotal = document.getElementById('statTotal');
    const statMale = document.getElementById('statMale');
    const statFemale = document.getElementById('statFemale');

    if (statTotal) statTotal.textContent = totalCount;
    if (statMale) statMale.textContent = maleCount;
    if (statFemale) statFemale.textContent = femaleCount;

    membersTableBody.innerHTML = '';
    
    if (!members || members.length === 0) {
      const colSpan = isAdminLoggedIn ? 11 : 10;
      membersTableBody.innerHTML = `<tr><td colspan="${colSpan}" style="text-align:center; padding: 20px;">No members found in database.</td></tr>`;
      return;
    }

    members.forEach((m, index) => {
      const row = document.createElement('tr');
      const photoPath = m.passport_photo_url ? `/${m.passport_photo_url}` : '/uploads/passports/default.jpg';
      const emailText = m.email ? `<br><small>${m.email}</small>` : '';

      row.innerHTML = `
        <td><strong>${index + 1}</strong></td>
        <td><img src="${photoPath}" alt="Photo" class="thumb" onerror="this.src='/uploads/passports/default.jpg'"></td>
        <td><strong>${m.student_reg_no}</strong></td>
        <td>${m.full_name}</td>
        <td>${m.gender}</td>
        <td>${m.contact}${emailText}</td>
        <td>${m.school}<br><small>${m.program}</small></td>
        <td>${m.year_joined}</td>
        <td>${m.association_role}</td>
        <td><span class="badge ${m.membership_status.toLowerCase()}">${m.membership_status}</span></td>
        ${isAdminLoggedIn ? `
          <td class="admin-only">
            <button class="btn-xs btn-edit" data-reg="${m.student_reg_no}">Edit</button>
            <button class="btn-xs btn-delete" data-reg="${m.student_reg_no}">Delete</button>
          </td>
        ` : ''}
      `;
      membersTableBody.appendChild(row);
    });

    if (isAdminLoggedIn) {
      attachTableActionListeners();
    }
  }

  // --- 3. FORM SUBMIT ---
  if (memberForm) {
    memberForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(memberForm);
      const url = isEditing ? `/api/members/${encodeURIComponent(editingRegNo)}` : '/api/members';
      const method = isEditing ? 'PUT' : 'POST';

      try {
        const response = await fetch(url, { method, body: formData });
        const result = await response.json();

        if (result.success) {
          alert(result.message);
          resetFormState();
          loadMembers(searchInput ? searchInput.value : '');
        } else {
          alert(`Server Error: ${result.message}`);
        }
      } catch (err) {
        alert(`Error: ${err.message}`);
      }
    });
  }

  // --- 4. TABLE ACTIONS ---
  function attachTableActionListeners() {
    document.querySelectorAll('.btn-edit').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const regNo = e.target.getAttribute('data-reg');
        try {
          const response = await fetch(`/api/members?search=${encodeURIComponent(regNo)}`);
          const result = await response.json();
          if (result.success && result.data.length > 0) {
            const member = result.data.find(m => m.student_reg_no === regNo) || result.data[0];
            populateFormForEdit(member);
          }
        } catch (err) {
          alert('Failed to fetch member for editing.');
        }
      });
    });

    document.querySelectorAll('.btn-delete').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const regNo = e.target.getAttribute('data-reg');
        if (confirm(`Are you sure you want to delete member ${regNo}?`)) {
          try {
            const response = await fetch(`/api/members/${encodeURIComponent(regNo)}`, { method: 'DELETE' });
            const result = await response.json();
            if (result.success) {
              alert(result.message);
              loadMembers(searchInput ? searchInput.value : '');
            } else {
              alert(`Delete Failed: ${result.message}`);
            }
          } catch (err) {
            alert('Failed to delete member.');
          }
        }
      });
    });
  }

  function populateFormForEdit(m) {
    isEditing = true;
    editingRegNo = m.student_reg_no;

    memberForm.student_reg_no.value = m.student_reg_no;
    memberForm.student_reg_no.disabled = true;
    memberForm.full_name.value = m.full_name;
    memberForm.gender.value = m.gender;
    memberForm.email.value = m.email || '';
    memberForm.contact.value = m.contact;
    memberForm.school.value = m.school;
    memberForm.program.value = m.program;
    memberForm.year_joined.value = m.year_joined;
    memberForm.association_role.value = m.association_role;
    memberForm.membership_status.value = m.membership_status;
    
    document.getElementById('passport_photo').required = false;
    document.getElementById('submitBtn').textContent = 'Update Member Record';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function resetFormState() {
    isEditing = false;
    editingRegNo = null;
    if (memberForm) {
      memberForm.reset();
      memberForm.student_reg_no.disabled = false;
    }
    document.getElementById('passport_photo').required = true;
    document.getElementById('submitBtn').textContent = 'Save Member to Database';
  }

  // --- 5. AUTH & MODALS ---
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('loginUsername').value;
      const password = document.getElementById('loginPassword').value;

      try {
        const response = await fetch('/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });
        const result = await response.json();

        if (result.success) {
          if (loginModal) loginModal.style.display = 'none';
          loginForm.reset();
          checkAuthStatus();
        } else {
          alert(result.message);
        }
      } catch (err) {
        alert('Login failed. Check server status.');
      }
    });
  }

  async function handleLogout() {
    try {
      const response = await fetch('/api/logout', { method: 'POST' });
      const result = await response.json();
      if (result.success) {
        checkAuthStatus();
      }
    } catch (err) {
      alert('Logout failed.');
    }
  }

  if (changePasswordForm) {
    changePasswordForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const currentPassword = document.getElementById('currentPassword').value;
      const newPassword = document.getElementById('newPassword').value;

      try {
        const response = await fetch('/api/change-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ currentPassword, newPassword })
        });
        const result = await response.json();

        if (result.success) {
          alert(result.message);
          if (passwordModal) passwordModal.style.display = 'none';
          changePasswordForm.reset();
        } else {
          alert(result.message);
        }
      } catch (err) {
        alert('Password change failed.');
      }
    });
  }

  document.querySelectorAll('.close-modal').forEach(span => {
    span.addEventListener('click', () => {
      if (loginModal) loginModal.style.display = 'none';
      if (passwordModal) passwordModal.style.display = 'none';
    });
  });

  window.addEventListener('click', (e) => {
    if (e.target === loginModal) loginModal.style.display = 'none';
    if (e.target === passwordModal) passwordModal.style.display = 'none';
  });

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      loadMembers(e.target.value);
    });
  }

  // --- 6. PDF EXPORT LOGIC WITH SIGNATURES & ROW COUNT ---
  const downloadPdfBtn = document.getElementById('downloadPdfBtn');

  if (downloadPdfBtn) {
    downloadPdfBtn.addEventListener('click', async () => {
      try {
        const jsPDFConstructor = window.jspdf ? (window.jspdf.jsPDF || window.jspdf) : window.jsPDF;
        
        if (!jsPDFConstructor) {
          alert('jsPDF library failed to load. Check internet connection and refresh.');
          return;
        }

        const doc = new jsPDFConstructor('landscape', 'mm', 'a4');

        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text('SOROTI UNIVERSITY MUSLIM STUDENTS ASSOCIATION (SUMUSA)', 14, 15);
        
        doc.setFontSize(12);
        doc.setFont('helvetica', 'normal');
        doc.text('Official Member Database Register', 14, 22);
        
        doc.setFontSize(10);
        doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 28);

        const response = await fetch('/api/members');
        const result = await response.json();

        if (!result.success || !result.data || result.data.length === 0) {
          alert('No records available to generate PDF.');
          return;
        }

        const tableRows = result.data.map((m, index) => [
          index + 1,
          m.student_reg_no || '',
          m.full_name || '',
          m.gender || '',
          m.contact || '',
          m.school || '',
          m.program || '',
          m.year_joined || '',
          m.association_role || '',
          m.membership_status || ''
        ]);

        let finalY = 40;

        if (typeof doc.autoTable === 'function') {
          doc.autoTable({
            startY: 32,
            head: [['#', 'Reg No', 'Full Name', 'Gender', 'Contact', 'School', 'Program', 'Year Joined', 'Role', 'Status']],
            body: tableRows,
            theme: 'grid',
            headStyles: { fillColor: [0, 64, 133], textColor: 255, fontStyle: 'bold' },
            styles: { fontSize: 8.5, cellPadding: 2.5 },
            columnStyles: {
              0: { cellWidth: 10, halign: 'center', fontStyle: 'bold' }
            },
            alternateRowStyles: { fillColor: [245, 245, 245] }
          });

          finalY = doc.autoTable.previous.finalY + 12;
        }

        // Calculate Gender Breakdown for PDF
        const totalMembers = result.data.length;
        const totalMales = result.data.filter(m => m.gender === 'Male').length;
        const totalFemales = result.data.filter(m => m.gender === 'Female').length;

        // --- ACCOUNTABILITY SUMMARY BLOCK ---
        doc.setFontSize(10);
        doc.setFont('timesnewroman', 'bold');
        doc.text(`MEMBERSHIP BREAKDOWN:`, 14, finalY);
        
        doc.setFont('timesnewroman', 'normal');
        doc.text(`Total Registered Members: ${totalMembers}   |   Males: ${totalMales}   |   Females: ${totalFemales}`, 14, finalY + 6);

        finalY += 22;

        if (finalY > 170) {
          doc.addPage();
          finalY = 30;
        }

        // Signature Section
        doc.setFontSize(10);
        doc.setFont('timesnewroman', 'bold');

        doc.text('PREPARED BY / PATRON:', 20, finalY);
        doc.line(20, finalY + 12, 110, finalY + 12);
        doc.setFont('timesnewroman', 'normal');
        doc.text('Name: __________________________', 20, finalY + 18);
        doc.text('Signature: _______________________', 20, finalY + 24);
        doc.text('Date: __________________________', 20, finalY + 30);

        doc.setFont('timesnewroman', 'bold');
        doc.text('APPROVED BY / CHAIRPERSON:', 180, finalY);
        doc.line(180, finalY + 12, 270, finalY + 12);
        doc.setFont('timesnewroman', 'normal');
        doc.text('Name: __________________________', 180, finalY + 18);
        doc.text('Signature: _______________________', 180, finalY + 24);
        doc.text('Date: __________________________', 180, finalY + 30);

        doc.save(`SUMUSA_Member_Register_${Date.now()}.pdf`);
      } catch (err) {
        console.error('PDF Export Error:', err);
        alert(`Failed to generate PDF: ${err.message}`);
      }
    });
  }

  // START SYSTEM
  checkAuthStatus();
});