export const UNIVERSITIES_LIST = [
  // ── Public Universities (General) ──
  'University of Dhaka (DU)',
  'University of Rajshahi (RU)',
  'University of Chittagong (CU)',
  'Jahangirnagar University (JU)',
  'Islamic University, Bangladesh (IU)',
  'Khulna University (KU)',
  'National University (NU)',
  'Bangladesh Open University (BOU)',
  'Jagannath University (JnU)',
  'Comilla University (CoU)',
  'Jatiya Kabi Kazi Nazrul Islam University (JKKNIU)',
  'Begum Rokeya University, Rangpur (BRUR)',
  'University of Barisal (BU)',
  'Rabindra University, Bangladesh (RUB)',
  'Sheikh Hasina University (SHU)',
  'Mujibnagar University (MU)',
  'Thakurgaon University (TU)',
  'Bangabandhu Sheikh Mujibur Rahman University, Kishoreganj (BSMRU)',
  'Bangabandhu Sheikh Mujibur Rahman University, Naogaon (BSMRU)',

  // ── Science & Technology Universities ──
  'Bangladesh University of Engineering and Technology (BUET)',
  'Shahjalal University of Science and Technology (SUST)',
  'Chittagong University of Engineering & Technology (CUET)',
  'Rajshahi University of Engineering & Technology (RUET)',
  'Khulna University of Engineering & Technology (KUET)',
  'Dhaka University of Engineering & Technology (DUET)',
  'Noakhali Science & Technology University (NSTU)',
  'Jessore University of Science & Technology (JUST)',
  'Pabna University of Science and Technology (PUST)',
  'Hajee Mohammad Danesh Science & Technology University (HSTU)',
  'Mawlana Bhashani Science & Technology University (MBSTU)',

  // ── Agricultural Universities ──
  'Bangladesh Agricultural University (BAU)',
  'Sher-e-Bangla Agricultural University (SAU)',
  'Patuakhali Science and Technology University (PSTU)',
  'Gazipur Agricultural University (GAU)',
  'Sylhet Agricultural University (SAU)',

  // ── Specialized Universities ──
  'Bangladesh Medical University (BMU)',
  'Chittagong Veterinary and Animal Sciences University (CVASU)',
  'Bangladesh University of Professionals (BUP)',
  'Military Institute of Science and Technology (MIST)',

  // ── Private Universities ──
  'North South University (NSU)',
  'BRAC University',
  'Independent University, Bangladesh (IUB)',
  'American International University-Bangladesh (AIUB)',
  'Daffodil International University (DIU)',
  'East West University (EWU)',
  'United International University (UIU)',
  'Ahsanullah University of Science and Technology (AUST)',
  'Islamic University of Technology (IUT)',
];

class AppStore {
  constructor() {
    this.storageKeyUser = 'academialink_current_user';
    this.storageKeyNotes = 'academialink_notes';
    this.storageKeyReports = 'academialink_reports';
    this.storageKeyUsersList = 'academialink_all_users';

    this.initStorage();
  }

  initStorage() {
    if (!localStorage.getItem(this.storageKeyNotes)) {
      localStorage.setItem(this.storageKeyNotes, JSON.stringify([]));
    }
    if (!localStorage.getItem(this.storageKeyReports)) {
      localStorage.setItem(this.storageKeyReports, JSON.stringify([]));
    }
    if (!localStorage.getItem(this.storageKeyUsersList)) {
      localStorage.setItem(this.storageKeyUsersList, JSON.stringify([]));
    }
  }

  getCurrentUser() {
    const raw = localStorage.getItem(this.storageKeyUser);
    return raw ? JSON.parse(raw) : null;
  }

  getAllUsers() {
    const raw = localStorage.getItem(this.storageKeyUsersList);
    return raw ? JSON.parse(raw) : [];
  }

  getNotes() {
    const raw = localStorage.getItem(this.storageKeyNotes);
    return raw ? JSON.parse(raw) : [];
  }

  getReports() {
    const raw = localStorage.getItem(this.storageKeyReports);
    return raw ? JSON.parse(raw) : [];
  }

  registerUser(userData) {
    const newUser = {
      id: `usr_${Date.now()}`,
      name: userData.name,
      email: userData.email,
      university: userData.university,
      department: userData.department || '',
      batch: userData.batch || '',
      regNo: userData.regNo || '',
      avatar: `https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80`,
      role: 'Student',
      isVerified: true,
      isStaff: false,
      cgpa: userData.cgpa || '',
      bio: userData.bio || 'Passionate student sharing learning materials.',
    };

    localStorage.setItem(this.storageKeyUser, JSON.stringify(newUser));

    const users = this.getAllUsers();
    users.push(newUser);
    localStorage.setItem(this.storageKeyUsersList, JSON.stringify(users));

    return newUser;
  }

  loginUser(email) {
    const users = this.getAllUsers();
    let user = users.find((u) => u.email.toLowerCase() === email.toLowerCase());

    if (!user) {
      user = {
        id: `usr_${Date.now()}`,
        name: email.split('@')[0],
        email: email,
        university: 'Bangladesh University of Engineering and Technology (BUET)',
        department: 'Computer Science',
        batch: '2022-2026',
        regNo: '202114001',
        avatar: `https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80`,
        role: 'Student',
        isVerified: true,
        isStaff: false,
        cgpa: '3.80',
        bio: 'Enthusiastic engineering student.',
      };
      users.push(user);
      localStorage.setItem(this.storageKeyUsersList, JSON.stringify(users));
    }

    localStorage.setItem(this.storageKeyUser, JSON.stringify(user));
    return user;
  }

  logoutUser() {
    localStorage.removeItem(this.storageKeyUser);
  }

  updateProfile(data) {
    const user = this.getCurrentUser();
    if (!user) return null;

    const updated = { ...user, ...data };
    localStorage.setItem(this.storageKeyUser, JSON.stringify(updated));

    const users = this.getAllUsers().map((u) => (u.id === user.id ? updated : u));
    localStorage.setItem(this.storageKeyUsersList, JSON.stringify(users));

    return updated;
  }

  addNote(noteData) {
    const user = this.getCurrentUser();
    const notes = this.getNotes();

    const newNote = {
      id: `note_${Date.now()}`,
      title: noteData.title,
      courseCode: noteData.courseCode,
      department: noteData.department,
      university: noteData.university,
      uploaderId: user ? user.id : 'anon',
      uploaderName: user ? user.name : 'Anonymous Student',
      uploaderAvatar: user ? user.avatar : 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=200&q=80',
      uploadDate: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      category: noteData.category || 'Lecture Notes',
      pdfUrl: noteData.pdfUrl,
      fileSize: noteData.fileSize || '2.4 MB',
      pageCount: noteData.pageCount || 10,
      tags: noteData.tags || ['Study Material'],
      isSaved: false,
      isVerified: true,
      description: noteData.description || '',
    };

    notes.unshift(newNote);
    localStorage.setItem(this.storageKeyNotes, JSON.stringify(notes));
    return newNote;
  }

  toggleSaveNote(noteId) {
    const notes = this.getNotes();
    let isSaved = false;
    const updated = notes.map((n) => {
      if (n.id === noteId) {
        n.isSaved = !n.isSaved;
        isSaved = n.isSaved;
      }
      return n;
    });
    localStorage.setItem(this.storageKeyNotes, JSON.stringify(updated));
    return isSaved;
  }

  deleteNote(noteId) {
    const notes = this.getNotes().filter((n) => n.id !== noteId);
    localStorage.setItem(this.storageKeyNotes, JSON.stringify(notes));
  }

  reportNote(noteId, noteTitle, reason, description) {
    const user = this.getCurrentUser();
    const reports = this.getReports();

    const newReport = {
      id: `rep_${Date.now()}`,
      noteId,
      noteTitle,
      reporterId: user ? user.id : 'anon',
      reporterName: user ? user.name : 'Anonymous Student',
      reason,
      description,
      timestamp: new Date().toLocaleString(),
    };

    reports.unshift(newReport);
    localStorage.setItem(this.storageKeyReports, JSON.stringify(reports));
    return newReport;
  }

  dismissReport(reportId) {
    const reports = this.getReports().filter((r) => r.id !== reportId);
    localStorage.setItem(this.storageKeyReports, JSON.stringify(reports));
  }

  toggleUserStaff(userId) {
    const users = this.getAllUsers().map((u) => {
      if (u.id === userId) {
        u.isStaff = !u.isStaff;
        u.role = u.isStaff ? 'Admin / Staff' : 'Student';
      }
      return u;
    });
    localStorage.setItem(this.storageKeyUsersList, JSON.stringify(users));

    const currentUser = this.getCurrentUser();
    if (currentUser && currentUser.id === userId) {
      currentUser.isStaff = !currentUser.isStaff;
      currentUser.role = currentUser.isStaff ? 'Admin / Staff' : 'Student';
      localStorage.setItem(this.storageKeyUser, JSON.stringify(currentUser));
    }
  }

  showToast(message, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.className = 'fixed bottom-5 right-5 z-50 flex flex-col gap-2 pointer-events-none';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    const bg =
      type === 'success'
        ? 'bg-emerald-600 text-white'
        : type === 'error'
        ? 'bg-rose-600 text-white'
        : 'bg-indigo-600 text-white';

    toast.className = `px-4 py-3 rounded-2xl shadow-xl text-xs font-bold flex items-center gap-2 pointer-events-auto animate-fade-in ${bg}`;
    toast.innerHTML = `
      <span class="material-symbols-outlined text-base">${
        type === 'success' ? 'check_circle' : type === 'error' ? 'error' : 'info'
      }</span>
      <span>${message}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
      toast.remove();
    }, 3000);
  }
}

export const appStore = new AppStore();
