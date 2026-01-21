// --- CONFIGURATION ---
const CATEGORY_TRIGGERS = ['flows', 'users', 'profiles', 'objects'];

// State Tracking
let currentCategory = null; 
let debounceTimer = null;

document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('cmdInput');
    const breadcrumb = document.getElementById('breadcrumb');
    
    // Auto-focus the input
    if(input) input.focus();

    // 1. INPUT LISTENER (Typing)
    if(input) {
        input.addEventListener('keydown', (e) => {
            // Handle Backspace to remove breadcrumb
            if (e.key === 'Backspace' && input.value === '' && currentCategory) {
                resetToRootMode();
                return;
            }

            // Handle Enter
            if (e.key === 'Enter') {
                e.preventDefault();
                handleEnterKey(input.value.trim());
            }
        });

        input.addEventListener('input', (e) => {
            const val = input.value.trim();
            
            // Mode 1: ROOT MODE
            if (!currentCategory) {
                // Waiting for Enter...
            } 
            // Mode 2: CATEGORY MODE
            else {
                if (debounceTimer) clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => {
                    fetchSuggestions(val);
                }, 300); // 300ms delay
            }
        });
    }
});


/**
 * Handles what happens when User hits Enter
 */
function handleEnterKey(inputValue) {
    const input = document.getElementById('cmdInput');
    const breadcrumb = document.getElementById('breadcrumb');

    // Case A: We are in Root Mode -> Switch to Category Mode
    if (!currentCategory) {
        const normalized = inputValue.toLowerCase();
        
        let category = null;
        if (normalized.startsWith('flow')) category = 'Flow';
        else if (normalized.startsWith('user')) category = 'User';
        else if (normalized.startsWith('profile')) category = 'Profile';
        else if (normalized.startsWith('obj')) category = 'Object';

        if (category) {
            // ACTIVATE CATEGORY MODE
            currentCategory = category;
            breadcrumb.textContent = category + " >";
            breadcrumb.style.display = "block";
            input.value = ""; 
            input.placeholder = `Type ${category} Name...`;
            updateStatus("Ready to search.");
        } else {
            // Not a category? Treat as standard setup search
            openUrl(`/lightning/setup/SetupOneHome/home?setupid=Search&searchVal=${encodeURIComponent(inputValue)}`);
        }
    }
    // Case B: We are in Category Mode -> Execute Selection
    else {
        fetchSuggestions(inputValue, true); // True = execute immediately
    }
}

function resetToRootMode() {
    currentCategory = null;
    document.getElementById('breadcrumb').style.display = 'none';
    document.getElementById('cmdInput').placeholder = "Type 'Flows', 'Users', 'Profiles'...";
    document.getElementById('suggestions').innerHTML = '';
    updateStatus('');
}

/**
 * FETCHES DATA FROM SALESFORCE
 */
async function fetchSuggestions(query, autoOpenFirst = false) {
    if (!query) return;
    updateStatus('Searching...');

    try {
        const { domain, sessionId } = await getRobustSession();
        let results = [];

        // --- QUERY ROUTER ---
        if (currentCategory === 'Flow') {
            // FIX: Query FlowDefinition (Fast) but grab the specific Version IDs (Safe)
            const q = `SELECT Id, DeveloperName, ActiveVersion.MasterLabel, LatestVersion.MasterLabel, ActiveVersionId, LatestVersionId FROM FlowDefinition WHERE DeveloperName LIKE '%${query}%' OR ActiveVersion.MasterLabel LIKE '%${query}%' LIMIT 5`;
            
            const res = await runToolingQuery(domain, sessionId, q);
            if (res.records) {
                results = res.records.map(r => {
                    // 1. Prefer the Active Version ID (Starts with 301)
                    // 2. Fallback to Latest Version ID (Draft) (Starts with 301)
                    // 3. Fallback to Definition ID (Starts with 300) - rare case
                    const targetId = r.ActiveVersionId || r.LatestVersionId || r.Id;
                    
                    // Determine which label to show
                    const labelName = r.ActiveVersion ? r.ActiveVersion.MasterLabel : (r.LatestVersion ? r.LatestVersion.MasterLabel : r.DeveloperName);
                    const status = r.ActiveVersionId ? 'Active' : 'Draft';

                    return {
                        id: targetId,
                        label: `${labelName} (${status})`,
                        sub: r.DeveloperName,
                        url: `/builder_platform_interaction/flowBuilder.app?flowId=${targetId}`
                    };
                });
            }
        }
        else if (currentCategory === 'User') {
            // ... (User logic unchanged) ...
            const q = `SELECT Id, Name, Username FROM User WHERE Name LIKE '%${query}%' LIMIT 5`;
            const res = await runDataQuery(domain, sessionId, q);
            if (res.records) {
                results = res.records.map(r => ({
                    id: r.Id,
                    label: r.Name,
                    sub: r.Username,
                    url: `/lightning/setup/ManageUsers/page?address=%2F${r.Id}`
                }));
            }
        }
        else if (currentCategory === 'Profile') {
            // ... (Profile logic unchanged) ...
            const q = `SELECT Id, Name FROM Profile WHERE Name LIKE '%${query}%' LIMIT 5`;
            const res = await runDataQuery(domain, sessionId, q);
            if (res.records) {
                results = res.records.map(r => ({
                    id: r.Id,
                    label: r.Name,
                    sub: 'Profile',
                    url: `/lightning/setup/EnhancedProfiles/page?address=%2F${r.Id}`
                }));
            }
        }
        else if (currentCategory === 'Object') {
            results = [{
                id: query,
                label: query,
                sub: 'Object Manager',
                url: `/lightning/setup/ObjectManager/${query}/Details/view`
            }];
        }

        // --- RENDER RESULTS ---
        renderSuggestions(results, domain);

        if (autoOpenFirst && results.length > 0) {
            openUrl(results[0].url, domain);
        }
        updateStatus('');

    } catch (e) {
        console.error(e);
        updateStatus('Error: ' + e.message);
    }
}

function renderSuggestions(items, domain) {
    const container = document.getElementById('suggestions');
    container.innerHTML = '';

    if (!items || items.length === 0) {
        const div = document.createElement('div');
        div.className = 'suggestion-item';
        div.textContent = 'No results found.';
        container.appendChild(div);
        return;
    }

    items.forEach(item => {
        const div = document.createElement('div');
        div.className = 'suggestion-item';
        div.innerHTML = `
            <span>${item.label}</span>
            <span class="suggestion-meta">${item.sub}</span>
        `;
        div.addEventListener('click', () => {
            openUrl(item.url, domain);
        });
        container.appendChild(div);
    });
}

// --- ROBUST SESSION LOGIC (UPDATED) ---

async function getRobustSession() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const currentHost = tab.url.split('/')[2];
    const currentOrigin = `https://${currentHost}`;
    
    // Safety check
    const isValidSalesforcePage = [
        '.lightning.force.com', '.vf.force.com', '.salesforce.com',
        '.my.salesforce.com', '.sandbox.my.salesforce.com', '.visual.force.com'
    ].some(domain => currentHost.endsWith(domain));

    if (!isValidSalesforcePage) {
        throw new Error('Please run on a Salesforce page.');
    }

    // 1. Try to get the cookie from the CURRENT domain first (Best for Enhanced Domains)
    let sessionCookie = await chrome.cookies.get({ url: currentOrigin, name: 'sid' });
    
    if (sessionCookie) {
        // If we found it locally, we can return immediately using the current host as the domain
        return { domain: currentOrigin, sessionId: sessionCookie.value };
    }

    // 2. Fallback: Try Domain Replacement (for older Sandbox configs)
    let apiHost;
    if (currentHost.includes('.lightning.force.com') || currentHost.includes('.vf.force.com')) {
        apiHost = currentHost
            .replace('.lightning.force.com', '.my.salesforce.com')
            .replace('.vf.force.com', '.my.salesforce.com')
            .replace('--c', '');
    } else {
        apiHost = currentHost;
    }

    const salesforceDomain = `https://${apiHost}`;
    
    // Only try fetching if it's actually different from the current origin we already checked
    if (salesforceDomain !== currentOrigin) {
        sessionCookie = await chrome.cookies.get({
            url: salesforceDomain,
            name: 'sid'
        });
    }

    if (!sessionCookie) {
        throw new Error(`Session cookie not found at ${salesforceDomain} OR ${currentHost}. Check manifest.`);
    }

    return { domain: salesforceDomain, sessionId: sessionCookie.value };
}

async function runDataQuery(domain, sessionId, query) {
    const url = `${domain}/services/data/v58.0/query?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${sessionId}` } });
    if (!res.ok) throw new Error("Query Failed: " + res.statusText);
    return res.json();
}

async function runToolingQuery(domain, sessionId, query) {
    const url = `${domain}/services/data/v58.0/tooling/query?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${sessionId}` } });
    if (!res.ok) throw new Error("Tooling Query Failed: " + res.statusText);
    return res.json();
}

async function openUrl(path, domainOverride) {
    let targetDomain = domainOverride;
    if (!targetDomain) {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const urlParts = new URL(tab.url);
        targetDomain = urlParts.origin;
    }
    const fullUrl = path.startsWith('http') ? path : targetDomain + path;
    await chrome.tabs.create({ url: fullUrl });
    window.close();
}

function updateStatus(msg) {
    const el = document.getElementById('status-bar');
    if(el) {
        el.textContent = msg;
        el.style.display = msg ? 'block' : 'none';
    }
}