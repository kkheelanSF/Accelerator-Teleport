// 1. The Setup Address Book
const NAVIGATION_MAP = {
    // Automation
    "flows": "/lightning/setup/Flows/home",
    "process builder": "/lightning/setup/ProcessAutomation/home",
    "approval processes": "/lightning/setup/ApprovalProcesses/home",
    "workflow rules": "/lightning/setup/WorkflowRules/home",
    
    // Code & Logic
    "apex classes": "/lightning/setup/ApexClasses/home",
    "apex triggers": "/lightning/setup/ApexTriggers/home",
    "visualforce pages": "/lightning/setup/VisualforcePages/home",
    "lightning components": "/lightning/setup/LightningComponentBundles/home",
    "debug logs": "/lightning/setup/ApexDebugLogs/home",
    
    // Users & Security
    "users": "/lightning/setup/ManageUsers/home",
    "profiles": "/lightning/setup/Profiles/home",
    "permission sets": "/lightning/setup/PermSets/home",
    "permission set groups": "/lightning/setup/PermSetGroups/home",
    "roles": "/lightning/setup/Roles/home",
    "sharing settings": "/lightning/setup/SecuritySharing/home",
    "login history": "/lightning/setup/LoginHistory/home",
    
    // Data & Objects
    "object manager": "/lightning/setup/ObjectManager/home",
    "custom metadata": "/lightning/setup/CustomMetadata/home",
    "custom settings": "/lightning/setup/CustomSettings/home",
    "schema builder": "/lightning/setup/SchemaBuilder/home",
    "import wizard": "/lightning/setup/DataManagementDataImporter/home",
    
    // Communication
    "email templates": "/lightning/setup/EmailTemplates/home",
    "classic templates": "/lightning/setup/CommunicationTemplatesEmail/home",
    "org-wide addresses": "/lightning/setup/OrgWideEmailAddresses/home"
};

document.addEventListener('DOMContentLoaded', () => {
    const navInput = document.getElementById('navSearch');
    const goButton = document.getElementById('goButton');
    
    // Listener for "Enter" key
    navInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            executeTeleport(navInput.value.toLowerCase().trim());
        }
    });

    // Listener for "Go" button click
    goButton.addEventListener('click', () => {
        executeTeleport(navInput.value.toLowerCase().trim());
    });
});

/**
 * The Teleportation Engine
 */
async function executeTeleport(input) {
    const statusDiv = document.getElementById('status');
    statusDiv.style.display = 'none'; // Reset status

    if (!input) {
        statusDiv.textContent = "Please type something first.";
        statusDiv.style.display = 'block';
        return;
    }

    try {
        // 1. Get the current tab to find the Salesforce domain
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        if (!tab || !tab.url.startsWith('http')) {
            statusDiv.textContent = "Error: Cannot read current tab URL.";
            statusDiv.style.display = 'block';
            return;
        }

        const urlParts = new URL(tab.url);
        const domain = urlParts.origin;

        // Basic check if we are loosely on a Salesforce-ish domain
        if (!domain.includes('force.com') && !domain.includes('salesforce.com')) {
            statusDiv.textContent = "Please use this on a Salesforce tab.";
            statusDiv.style.display = 'block';
            return;
        }

        let targetPath = "";

        // 2. Check Address Book
        if (NAVIGATION_MAP[input]) {
            targetPath = NAVIGATION_MAP[input];
        } 
        // 3. Object Manager Logic (e.g. "obj account")
        else if (input.startsWith('obj ')) {
            const objName = input.replace('obj ', '');
            targetPath = `/lightning/setup/ObjectManager/${objName}/Details/view`;
        }
        // 4. Fallback: Search
        else {
            targetPath = `/lightning/setup/SetupOneHome/home?setupid=Search&searchVal=${encodeURIComponent(input)}`;
        }

        // 5. Open in NEW tab
        await chrome.tabs.create({ url: domain + targetPath });

    } catch (error) {
        console.error(error);
        statusDiv.textContent = "Error: " + error.message;
        statusDiv.style.display = 'block';
    }
}