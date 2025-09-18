// Configuration - Static JSON mode
const USE_STATIC_DATA = true;
const DATA_BASE_PATH = 'data/';

// State
let allDeals = []; // Store all deals for client-side filtering
let currentPlans = [];
let allProviders = [];
let selectedProviders = [];
let currentPage = 1;
let pageSize = 20;
let totalPlans = 0;
let isLoading = false;
let currentFilters = {};
let sortColumn = 'total_savings';
let sortDirection = 'desc';

// DOM Elements
const loadingEl = document.getElementById('loading');
const errorEl = document.getElementById('error');
const noResultsEl = document.getElementById('no-results');
const plansContainer = document.getElementById('plans-container');
const cardsContainer = document.getElementById('plans-cards-container');
const providerFilter = document.getElementById('provider-filter');
const providerOptions = document.getElementById('provider-options');
const providerList = document.getElementById('provider-list');
const providerSearch = document.getElementById('provider-search');
const speedFilter = document.getElementById('speed-filter');
const priceFilter = document.getElementById('price-filter');
const promoTypeFilter = document.getElementById('promo-type-filter');
const minSavingsFilter = document.getElementById('min-savings-filter');
const firstBtn = document.getElementById('first-btn');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');
const lastBtn = document.getElementById('last-btn');
const pageInfo = document.getElementById('page-info');
const pageSizeSelect = document.getElementById('page-size');
const toggleFiltersBtn = document.getElementById('toggle-filters');
const filterContainer = document.getElementById('filter-container');
const mobileSortSelect = document.getElementById('mobile-sort-select');

// Initialize the application
document.addEventListener('DOMContentLoaded', async () => {
    setupEventListeners();
    loadFilterPreferences();
    await loadStaticData();
});

// Load static data from JSON files
async function loadStaticData() {
    try {
        showLoading();
        
        // Load providers and deals
        await Promise.all([
            loadProvidersFromJSON(),
            loadDealsFromJSON()
        ]);
        
        // Apply initial filters and render
        applyFiltersAndRender();
        hideLoading();
        
        console.log('✅ Static deals data loaded successfully');
    } catch (error) {
        console.error('❌ Error loading static deals data:', error);
        hideLoading();
        showError();
    }
}

// Load providers from JSON
async function loadProvidersFromJSON() {
    try {
        const response = await fetch(`${DATA_BASE_PATH}providers.json?v=${Date.now()}`);
        if (!response.ok) throw new Error('Failed to load providers data');
        
        const data = await response.json();
        allProviders = data.data || data; // Handle both wrapped and unwrapped formats
        populateProviderFilter();
        
        console.log(`Loaded ${allProviders.length} providers from JSON`);
    } catch (error) {
        console.error('Error loading providers:', error);
        throw error;
    }
}

// Load deals from JSON
async function loadDealsFromJSON() {
    try {
        const response = await fetch(`${DATA_BASE_PATH}deals.json?v=${Date.now()}`);
        if (!response.ok) throw new Error('Failed to load deals data');

        const data = await response.json();
        allDeals = data.data || data; // Handle both wrapped and unwrapped formats

        // Calculate total savings and promo price for each deal if not provided
        allDeals.forEach(deal => {
            if (!deal.total_savings && deal.promo_value) {
                deal.total_savings = calculateTotalSavings(deal);
            }
            if (!deal.promo_price && deal.promo_type) {
                deal.promo_price = calculatePromoPrice(deal);
            }
        });

        // Populate speed filter with actual speeds from data
        populateSpeedFilter();

        console.log(`Loaded ${allDeals.length} deals from JSON`);
    } catch (error) {
        console.error('Error loading deals:', error);
        throw error;
    }
}

// Apply filters and render results
function applyFiltersAndRender() {
    // Start with all deals
    let filteredDeals = [...allDeals];
    
    // Apply filters
    filteredDeals = applyClientSideFilters(filteredDeals);
    
    // Update total count
    totalPlans = filteredDeals.length;
    
    // Apply sorting
    sortPlansArray(filteredDeals);
    
    // Apply pagination
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    currentPlans = filteredDeals.slice(startIndex, endIndex);
    
    // Remove static content only after we have real data
    document.querySelectorAll('.static-content').forEach(el => el.remove());
    
    // Render results
    renderPlans(currentPlans);
    updatePaginationControls();
    updateSortIcons();
    updateMobileSortSelect();
    
    if (filteredDeals.length === 0) {
        showNoResults();
    } else {
        hideNoResults();
    }
}

// Apply client-side filters
function applyClientSideFilters(deals) {
    return deals.filter(deal => {
        // Provider filter
        if (currentFilters.provider_ids && currentFilters.provider_ids.length > 0) {
            if (!currentFilters.provider_ids.includes(deal.provider_id?.toString())) {
                return false;
            }
        }
        
        // Speed filter (exact match)
        if (currentFilters.speed) {
            const dealSpeed = deal.download_speed || 0;
            if (dealSpeed !== currentFilters.speed) {
                return false;
            }
        }
        
        // Max price filter
        if (currentFilters.max_price) {
            if (deal.monthly_price > currentFilters.max_price) {
                return false;
            }
        }
        
        // Promo type filter
        if (currentFilters.promo_type) {
            if (!deal.promo_type || deal.promo_type.toLowerCase() !== currentFilters.promo_type.toLowerCase()) {
                return false;
            }
        }
        
        // Min savings filter
        if (currentFilters.min_savings) {
            const savings = deal.total_savings || 0;
            if (savings < currentFilters.min_savings) {
                return false;
            }
        }
        
        return true;
    });
}

// Navigate to specific page
function goToPage(page) {
    const totalPages = getTotalPages();
    if (page >= 1 && page <= totalPages && page !== currentPage) {
        currentPage = page;
        applyFiltersAndRender();
    }
}

// Calculate total savings based on promo type
function calculateTotalSavings(plan) {
    if (!plan.promo_value) return 0;

    switch (plan.promo_type?.toLowerCase()) {
        case 'discount':
            const duration = plan.promo_duration && plan.promo_duration > 0 ? plan.promo_duration : 1;
            return plan.promo_value * duration;
        case 'free_months':
            return plan.monthly_price * plan.promo_value;
        case 'setup_waived':
            return plan.setup_fee || 0;
        default:
            return plan.promo_value;
    }
}

// Calculate promotional price (price during promo period)
function calculatePromoPrice(plan) {
    if (!plan.promo_value || !plan.promo_type) return plan.monthly_price;

    switch (plan.promo_type?.toLowerCase()) {
        case 'discount':
            return Math.max(0, plan.monthly_price - plan.promo_value);
        case 'free_months':
            return 0; // Free means $0
        case 'setup_waived':
            return plan.monthly_price; // Setup fee doesn't affect monthly price
        default:
            return plan.monthly_price;
    }
}

// Event Listeners
function setupEventListeners() {
    // Filter controls
    document.getElementById('apply-filters').addEventListener('click', applyFilters);
    document.getElementById('clear-filters').addEventListener('click', clearFilters);
    document.getElementById('retry-btn').addEventListener('click', () => {
        window.location.reload();
    });

    // Pagination controls
    firstBtn.addEventListener('click', () => goToPage(1));
    prevBtn.addEventListener('click', () => goToPage(currentPage - 1));
    nextBtn.addEventListener('click', () => goToPage(currentPage + 1));
    lastBtn.addEventListener('click', () => goToPage(getTotalPages()));
    pageSizeSelect.addEventListener('change', (e) => {
        pageSize = parseInt(e.target.value);
        currentPage = 1;
        applyFiltersAndRender();
    });

    // Enter key on filters
    priceFilter.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            applyFilters();
        }
    });

    minSavingsFilter.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            applyFilters();
        }
    });

    // Column sorting
    document.querySelectorAll('.sortable').forEach(header => {
        header.addEventListener('click', () => {
            const column = header.dataset.sort;
            if (sortColumn === column) {
                sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
            } else {
                sortColumn = column;
                sortDirection = column === 'total_savings' ? 'desc' : 'asc';
            }
            applyFiltersAndRender();
        });
    });

    // Filter toggle
    toggleFiltersBtn.addEventListener('click', () => {
        const isExpanded = toggleFiltersBtn.getAttribute('aria-expanded') === 'true';
        const newExpanded = !isExpanded;

        toggleFiltersBtn.setAttribute('aria-expanded', newExpanded.toString());

        if (newExpanded) {
            filterContainer.classList.remove('collapsed');
            toggleFiltersBtn.innerHTML = '<span class="toggle-icon">▼</span> Hide Filters';
        } else {
            filterContainer.classList.add('collapsed');
            toggleFiltersBtn.innerHTML = '<span class="toggle-icon">▶</span> Show Filters';
        }

        localStorage.setItem('dealsFiltersExpanded', newExpanded.toString());
    });

    // Mobile sort dropdown
    mobileSortSelect.addEventListener('change', (e) => {
        const [column, direction] = e.target.value.split('-');
        sortColumn = column;
        sortDirection = direction;
        applyFiltersAndRender();
    });

    // Handle window resize to switch between mobile and desktop layouts
    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            // Re-render plans with the appropriate layout
            renderPlans(currentPlans);
            // Update mobile sort dropdown to match current sort
            updateMobileSortSelect();
        }, 150);
    });
}

// Load filter preferences from localStorage
function loadFilterPreferences() {
    const filtersExpanded = localStorage.getItem('dealsFiltersExpanded');
    const isMobile = window.innerWidth <= 768;

    // Default to collapsed on mobile, expanded on desktop
    const defaultExpanded = !isMobile;

    // Use stored preference if available, otherwise use default
    const shouldExpand = filtersExpanded !== null ? filtersExpanded === 'true' : defaultExpanded;

    if (!shouldExpand) {
        filterContainer.classList.add('collapsed');
        toggleFiltersBtn.setAttribute('aria-expanded', 'false');
        toggleFiltersBtn.innerHTML = '<span class="toggle-icon">▶</span> Show Filters';
    }
}

// Populate provider filter dropdown
function populateProviderFilter() {
    providerList.innerHTML = '';

    // Add "Clear All" option at the top
    const clearAllOption = document.createElement('div');
    clearAllOption.className = 'multi-select-clear-all';
    clearAllOption.innerHTML = `
        <button type="button" class="clear-all-btn">Clear All Providers</button>
    `;
    providerList.appendChild(clearAllOption);

    allProviders.forEach(provider => {
        const option = document.createElement('label');
        option.className = 'multi-select-option';
        option.setAttribute('for', `provider-${provider.id}`);
        option.setAttribute('data-provider-name', provider.name.toLowerCase());
        option.innerHTML = `
            <input type="checkbox" id="provider-${provider.id}" value="${provider.id}">
            <span>${provider.name}</span>
        `;
        providerList.appendChild(option);
    });

    // Add event listeners for multi-select
    setupMultiSelectEvents();
}

// Populate speed filter dropdown with actual speeds from data
function populateSpeedFilter() {
    // Extract unique download speeds from all deals
    const speeds = [...new Set(allDeals
        .map(deal => deal.download_speed)
        .filter(speed => speed && speed > 0))]
        .sort((a, b) => a - b);

    // Clear existing options except the first "All Speeds" option
    speedFilter.innerHTML = '<option value="">All Speeds</option>';

    // Add speed options
    speeds.forEach(speed => {
        const option = document.createElement('option');
        option.value = speed;
        option.textContent = `NBN ${speed}`;
        speedFilter.appendChild(option);
    });

    console.log(`Populated speed filter with ${speeds.length} speed options:`, speeds);
}

// Setup multi-select events
function setupMultiSelectEvents() {
    const display = providerFilter.querySelector('.multi-select-display');

    // Toggle dropdown
    display.addEventListener('click', (e) => {
        e.stopPropagation();
        providerFilter.classList.toggle('open');
        if (providerFilter.classList.contains('open')) {
            providerSearch.focus();
        }
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!providerFilter.contains(e.target)) {
            providerFilter.classList.remove('open');
        }
    });

    // Handle checkbox changes
    providerList.addEventListener('change', (e) => {
        if (e.target.type === 'checkbox') {
            updateSelectedProviders();
            updateProviderDisplay();

            // Clear search and show all options after selection
            providerSearch.value = '';
            providerList.querySelectorAll('.multi-select-option').forEach(option => {
                option.style.display = 'flex';
            });
        }
    });

    // Handle search input
    providerSearch.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        const options = providerList.querySelectorAll('.multi-select-option');

        options.forEach(option => {
            const providerName = option.getAttribute('data-provider-name');
            if (providerName.includes(searchTerm)) {
                option.style.display = 'flex';
            } else {
                option.style.display = 'none';
            }
        });
    });

    // Prevent dropdown from closing when clicking on search input
    providerSearch.addEventListener('click', (e) => {
        e.stopPropagation();
    });

    // Handle "Clear All" button
    const clearAllBtn = providerList.querySelector('.clear-all-btn');
    if (clearAllBtn) {
        clearAllBtn.addEventListener('click', (e) => {
            e.stopPropagation();

            // Uncheck all provider checkboxes
            providerList.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
                checkbox.checked = false;
            });

            // Update state and display
            selectedProviders = [];
            updateProviderDisplay();

            // Clear search and show all options
            providerSearch.value = '';
            providerList.querySelectorAll('.multi-select-option').forEach(option => {
                option.style.display = 'flex';
            });
        });
    }
}

// Update selected providers array
function updateSelectedProviders() {
    selectedProviders = Array.from(providerList.querySelectorAll('input[type="checkbox"]:checked'))
        .map(checkbox => checkbox.value);
}

// Update provider display text
function updateProviderDisplay() {
    const display = providerFilter.querySelector('.multi-select-display');
    if (selectedProviders.length === 0) {
        display.textContent = 'All Providers';
    } else {
        const selectedNames = selectedProviders.map(id => {
            const provider = allProviders.find(p => p.id == id);
            return provider ? provider.name : '';
        }).filter(name => name).join(', ');

        display.textContent = selectedNames;
    }
}

// Get total number of pages
function getTotalPages() {
    return Math.max(1, Math.ceil(totalPlans / pageSize));
}

// Sort plans array
function sortPlansArray(plans) {
    plans.sort((a, b) => {
        let aValue = a[sortColumn];
        let bValue = b[sortColumn];

        // Handle null/undefined values
        if (aValue === null || aValue === undefined) aValue = sortDirection === 'asc' ? Infinity : -Infinity;
        if (bValue === null || bValue === undefined) bValue = sortDirection === 'asc' ? Infinity : -Infinity;

        // String comparison for text fields
        if (typeof aValue === 'string') {
            aValue = aValue.toLowerCase();
            bValue = bValue.toLowerCase();
        }

        if (sortDirection === 'asc') {
            return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
        } else {
            return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
        }
    });
}

// Update sort icons
function updateSortIcons() {
    document.querySelectorAll('.sort-icon').forEach(icon => {
        icon.textContent = '';
    });

    const activeHeader = document.querySelector(`[data-sort="${sortColumn}"] .sort-icon`);
    if (activeHeader) {
        activeHeader.textContent = sortDirection === 'asc' ? '▲' : '▼';
    }
}

// Update mobile sort dropdown to match current sort
function updateMobileSortSelect() {
    const currentValue = `${sortColumn}-${sortDirection}`;
    if (mobileSortSelect && mobileSortSelect.value !== currentValue) {
        mobileSortSelect.value = currentValue;
    }
}

// Apply filters
function applyFilters() {
    updateSelectedProviders();
    const speed = speedFilter.value;
    const maxPrice = priceFilter.value;
    const promoType = promoTypeFilter.value;
    const minSavings = minSavingsFilter.value;

    currentFilters = {};

    if (selectedProviders.length > 0) {
        currentFilters.provider_ids = selectedProviders;
    }

    if (speed) {
        currentFilters.speed = parseInt(speed);
    }

    if (maxPrice) {
        currentFilters.max_price = parseFloat(maxPrice);
    }

    if (promoType) {
        currentFilters.promo_type = promoType;
    }

    if (minSavings) {
        currentFilters.min_savings = parseFloat(minSavings);
    }

    console.log('Applied filters:', currentFilters);

    currentPage = 1;
    applyFiltersAndRender();
}

// Clear all filters
function clearFilters() {
    // Clear provider checkboxes
    providerList.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
        checkbox.checked = false;
    });
    selectedProviders = [];
    updateProviderDisplay();

    // Clear search
    providerSearch.value = '';
    providerList.querySelectorAll('.multi-select-option').forEach(option => {
        option.style.display = 'flex';
    });

    speedFilter.value = '';
    priceFilter.value = '';
    promoTypeFilter.value = '';
    minSavingsFilter.value = '';
    currentFilters = {};
    currentPage = 1;
    applyFiltersAndRender();
}

// Update pagination controls
function updatePaginationControls() {
    const totalPages = getTotalPages();

    pageInfo.textContent = `Page ${currentPage} of ${totalPages} (${currentPlans.length} deals shown)`;

    firstBtn.disabled = currentPage <= 1;
    prevBtn.disabled = currentPage <= 1;
    nextBtn.disabled = currentPage >= totalPages;
    lastBtn.disabled = currentPage >= totalPages;
}

// Render plans in the table or cards
function renderPlans(plans) {
    // Check if we're on mobile (width <= 768px)
    const isMobile = window.innerWidth <= 768;
    
    if (isMobile) {
        // Create card layout for mobile
        cardsContainer.innerHTML = plans.map(plan => createPlanCard(plan)).join('');
        plansContainer.innerHTML = '';
    } else {
        // Create table rows for desktop
        plansContainer.innerHTML = plans.map(plan => createPlanRow(plan)).join('');
        cardsContainer.innerHTML = '';
    }
}

// Create a plan table row HTML
function createPlanRow(plan) {
    const totalSavings = plan.total_savings || calculateTotalSavings(plan);
    const promoPrice = plan.promo_price || calculatePromoPrice(plan);
    const hasPromo = plan.promo_value && plan.promo_type;

    // Create provider cell with link if website is available
    const providerCell = plan.provider_website
        ? `<a href="${plan.provider_website}" target="_blank" rel="noopener noreferrer" class="provider-link">${plan.provider_name || 'Unknown'}</a>`
        : (plan.provider_name || 'Unknown');

    // Create fixed wireless indicator if applicable
    const fixedWirelessIcon = plan.fixed_wireless
        ? `<span class="fixed-wireless-info" title="Fixed Wireless NBN" style="margin-left: 5px; color: #8b5cf6; font-weight: bold; font-size: 8px; cursor: help; background: #f3f0ff; padding: 1px 4px; border-radius: 3px;">FW</span>`
        : '';

    const planNameCell = `${plan.plan_name}${fixedWirelessIcon}`;

    return `
        <tr class="deal-row">
            <td class="provider-cell">${providerCell}</td>
            <td class="plan-cell" title="${plan.plan_name}">${planNameCell}</td>
            <td class="speed-cell">${formatSpeed(plan)}</td>
            <td class="price-cell">$${plan.monthly_price.toFixed(2)}</td>
            <td class="promo-price-cell ${hasPromo ? '' : 'no-promo'}">${hasPromo ? `$${promoPrice.toFixed(2)}` : '-'}</td>
            <td class="promo-cell">${formatPromotion(plan)}</td>
            <td class="savings-cell">$${totalSavings.toFixed(0)}</td>
            <td class="contract-cell">${plan.contract_length ? `${plan.contract_length}mo` : '-'}</td>
        </tr>
    `;
}

// Format speed display
function formatSpeed(plan) {
    if (plan.speed_tier) {
        return plan.speed_tier;
    }
    if (plan.download_speed && plan.upload_speed) {
        return `${plan.download_speed}/${plan.upload_speed}`;
    }
    if (plan.download_speed) {
        return `${plan.download_speed} Mbps`;
    }
    return 'N/A';
}

// Format promotion text
function formatPromotion(plan) {
    if (!plan.promo_value || !plan.promo_type) return 'Special Offer';

    switch (plan.promo_type.toLowerCase()) {
        case 'discount':
            const duration = plan.promo_duration && plan.promo_duration > 0 ? `for ${plan.promo_duration}mo` : '';
            return `$${plan.promo_value.toFixed(2)} off ${duration}`.trim();
        case 'free_months':
            return `${plan.promo_value} months free`;
        case 'setup_waived':
            return 'Free setup';
        case 'bonus':
            return plan.promo_details || 'Bonus inclusion';
        default:
            return plan.promo_details || plan.promo_type;
    }
}

// Create a plan card HTML for mobile
function createPlanCard(plan) {
    const totalSavings = plan.total_savings || calculateTotalSavings(plan);
    const promoPrice = plan.promo_price || calculatePromoPrice(plan);
    const hasPromo = plan.promo_value && plan.promo_type;

    // Create provider cell with link if website is available
    const providerLink = plan.provider_website
        ? `<a href="${plan.provider_website}" target="_blank" rel="noopener noreferrer" class="plan-card-provider">${plan.provider_name || 'Unknown'}</a>`
        : `<div class="plan-card-provider">${plan.provider_name || 'Unknown'}</div>`;

    // Create fixed wireless badge if applicable
    const fixedWirelessBadge = plan.fixed_wireless
        ? `<span class="fixed-wireless-badge" title="Fixed Wireless NBN">Fixed Wireless</span>`
        : '';

    const promoContent = hasPromo 
        ? `<div class="plan-card-promo">${formatPromotion(plan)}</div>`
        : '';

    const promoPriceDisplay = hasPromo 
        ? `<div class="plan-card-promo-price">Promo: $${promoPrice.toFixed(2)}/mo</div>`
        : '';

    return `
        <div class="plan-card">
            <div class="plan-card-header">
                ${providerLink}
                <div class="plan-card-price">
                    $${plan.monthly_price.toFixed(2)}/mo
                    ${promoPriceDisplay}
                </div>
            </div>
            <div class="plan-card-name">
                ${plan.plan_name}${fixedWirelessBadge}
            </div>
            <div class="plan-card-details">
                <div class="plan-card-detail">
                    <div class="plan-card-detail-label">Speed</div>
                    <div class="plan-card-detail-value">${formatSpeed(plan)}</div>
                </div>
                <div class="plan-card-detail">
                    <div class="plan-card-detail-label">Total Savings</div>
                    <div class="plan-card-detail-value">$${totalSavings.toFixed(0)}</div>
                </div>
            </div>
            <div class="plan-card-details">
                <div class="plan-card-detail">
                    <div class="plan-card-detail-label">Contract</div>
                    <div class="plan-card-detail-value">${plan.contract_length ? `${plan.contract_length} months` : 'No lock-in'}</div>
                </div>
            </div>
            ${promoContent}
        </div>
    `;
}

// UI State Management
function showLoading() {
    loadingEl.classList.remove('hidden');
    plansContainer.innerHTML = '';
}

function hideLoading() {
    loadingEl.classList.add('hidden');
}

function showError() {
    errorEl.classList.remove('hidden');
    plansContainer.innerHTML = '';
}

function hideError() {
    errorEl.classList.add('hidden');
}

function showNoResults() {
    noResultsEl.classList.remove('hidden');
    plansContainer.innerHTML = '';
}

function hideNoResults() {
    noResultsEl.classList.add('hidden');
}