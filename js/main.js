// Configuration - Static JSON mode
const USE_STATIC_DATA = true;
const DATA_BASE_PATH = 'data/';

// State
let allPlans = []; // Store all plans for client-side filtering
let currentPlans = [];
let allProviders = [];
let allRatings = {}; // Store provider ratings data
let selectedProviders = [];
let currentPage = 1;
let pageSize = 20;
let totalPlans = 0;
let isLoading = false;
let currentFilters = {};
let sortColumn = 'monthly_price';
let sortDirection = 'asc';

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
const contractFilter = document.getElementById('contract-filter');
const wirelessFilter = document.getElementById('wireless-filter');
const minDownloadFilter = document.getElementById('min-download-filter');
const maxDownloadFilter = document.getElementById('max-download-filter');
const minUploadFilter = document.getElementById('min-upload-filter');
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
        
        // Load providers, plans, and ratings
        await Promise.all([
            loadProvidersFromJSON(),
            loadPlansFromJSON(),
            loadRatingsFromJSON()
        ]);
        
        // Apply initial filters and render
        applyFiltersAndRender();
        hideLoading();
        
        console.log('✅ Static data loaded successfully');
    } catch (error) {
        console.error('❌ Error loading static data:', error);
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

        // Log rating statistics
        const providersWithRatings = allProviders.filter(p => p.review_data && p.review_data.rating);
        console.log(`Loaded ${allProviders.length} providers from JSON (${providersWithRatings.length} with ratings)`);
    } catch (error) {
        console.error('Error loading providers:', error);
        throw error;
    }
}

// Load plans from JSON
async function loadPlansFromJSON() {
    try {
        const response = await fetch(`${DATA_BASE_PATH}plans.json?v=${Date.now()}`);
        if (!response.ok) throw new Error('Failed to load plans data');

        const data = await response.json();
        allPlans = data.data || data; // Handle both wrapped and unwrapped formats

        // Calculate promo price for each plan if not provided
        allPlans.forEach(plan => {
            if (!plan.promo_price) {
                plan.promo_price = calculatePromoPrice(plan);
            }
        });

        // Populate speed filter with actual speeds from data
        populateSpeedFilter();

        console.log(`Loaded ${allPlans.length} plans from JSON`);
    } catch (error) {
        console.error('Error loading plans:', error);
        throw error;
    }
}

// Load ratings from JSON
async function loadRatingsFromJSON() {
    try {
        const response = await fetch(`${DATA_BASE_PATH}ratings.json?v=${Date.now()}`);
        if (!response.ok) {
            console.warn('⚠️ Ratings data not available - continuing without ratings');
            allRatings = {};
            return;
        }
        const data = await response.json();
        allRatings = data.ratings || {}; // Handle wrapped format
        const ratingsCount = Object.keys(allRatings).length;
        console.log(`✅ Loaded ratings for ${ratingsCount} providers`);
    } catch (error) {
        console.warn('⚠️ Error loading ratings (continuing without ratings):', error);
        allRatings = {};
    }
}

// Apply filters and render results
function applyFiltersAndRender() {
    // Start with all plans
    let filteredPlans = [...allPlans];
    
    // Apply filters
    filteredPlans = applyClientSideFilters(filteredPlans);
    
    // Update total count
    totalPlans = filteredPlans.length;
    
    // Apply sorting
    sortPlansArray(filteredPlans);
    
    // Apply pagination
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    currentPlans = filteredPlans.slice(startIndex, endIndex);
    
    // Render results
    renderPlans(currentPlans);
    updatePaginationControls();
    updateSortIcons();
    updateMobileSortSelect();
    
    if (filteredPlans.length === 0) {
        showNoResults();
    } else {
        hideNoResults();
    }
}

// Apply client-side filters
function applyClientSideFilters(plans) {
    return plans.filter(plan => {
        // Provider filter
        if (currentFilters.provider_ids && currentFilters.provider_ids.length > 0) {
            if (!currentFilters.provider_ids.includes(plan.provider_id?.toString())) {
                return false;
            }
        }
        
        // Speed filter (exact match)
        if (currentFilters.speed) {
            const planSpeed = plan.download_speed || 0;
            if (planSpeed !== currentFilters.speed) {
                return false;
            }
        }
        
        // Max price filter
        if (currentFilters.max_price) {
            if (plan.monthly_price > currentFilters.max_price) {
                return false;
            }
        }
        
        // Contract length filter
        if (currentFilters.contract_length !== undefined) {
            const planContract = plan.contract_length || 0;
            if (planContract !== currentFilters.contract_length) {
                return false;
            }
        }
        
        // Fixed wireless filter
        if (currentFilters.fixed_wireless !== undefined) {
            if (plan.fixed_wireless !== currentFilters.fixed_wireless) {
                return false;
            }
        }
        
        // Min download speed filter
        if (currentFilters.min_download_speed) {
            const planSpeed = plan.download_speed || 0;
            if (planSpeed < currentFilters.min_download_speed) {
                return false;
            }
        }
        
        // Max download speed filter
        if (currentFilters.max_download_speed) {
            const planSpeed = plan.download_speed || 0;
            if (planSpeed > currentFilters.max_download_speed) {
                return false;
            }
        }
        
        // Min upload speed filter
        if (currentFilters.min_upload_speed) {
            const planSpeed = plan.upload_speed || 0;
            if (planSpeed < currentFilters.min_upload_speed) {
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

    minDownloadFilter.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            applyFilters();
        }
    });

    maxDownloadFilter.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            applyFilters();
        }
    });

    minUploadFilter.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            applyFilters();
        }
    });

    // Column sorting
    document.querySelectorAll('.sortable').forEach(header => {
        header.addEventListener('click', (e) => {
            const column = header.dataset.sort;
            if (sortColumn === column) {
                sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
            } else {
                sortColumn = column;
                sortDirection = 'asc';
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

        // Save preference to localStorage
        localStorage.setItem('filtersExpanded', newExpanded.toString());
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
        }, 250);
    });
}

// Load filter preferences from localStorage
function loadFilterPreferences() {
    const filtersExpanded = localStorage.getItem('filtersExpanded');
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
    // Extract unique download speeds from all plans
    const speeds = [...new Set(allPlans
        .map(plan => plan.download_speed)
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

// Get total number of pages
function getTotalPages() {
    return Math.max(1, Math.ceil(totalPlans / pageSize));
}

// Sort plans array
function sortPlansArray(plans) {
    plans.sort((a, b) => {
        let aValue, bValue;

        // Special handling for provider_rating column
        if (sortColumn === 'provider_rating') {
            const aProvider = getProviderById(a.provider_id);
            const bProvider = getProviderById(b.provider_id);

            // Get rating values (prefer NBN-specific rating)
            aValue = (aProvider && aProvider.review_data)
                ? (aProvider.review_data.nbn_rating || aProvider.review_data.rating || 0)
                : 0;
            bValue = (bProvider && bProvider.review_data)
                ? (bProvider.review_data.nbn_rating || bProvider.review_data.rating || 0)
                : 0;
        } else {
            aValue = a[sortColumn];
            bValue = b[sortColumn];
        }

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
    if (mobileSortSelect) {
        const sortValue = `${sortColumn}-${sortDirection}`;
        mobileSortSelect.value = sortValue;
    }
}

// Apply filters
function applyFilters() {
    updateSelectedProviders();
    const speed = speedFilter.value;
    const maxPrice = priceFilter.value;
    const contractLength = contractFilter.value;
    const fixedWireless = wirelessFilter.value;
    const minDownload = minDownloadFilter.value;
    const maxDownload = maxDownloadFilter.value;
    const minUpload = minUploadFilter.value;

    // Build filters object
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

    if (contractLength !== '') {
        currentFilters.contract_length = parseInt(contractLength);
    }

    if (fixedWireless) {
        currentFilters.fixed_wireless = fixedWireless === 'true';
    }

    if (minDownload) {
        currentFilters.min_download_speed = parseInt(minDownload);
    }

    if (maxDownload) {
        currentFilters.max_download_speed = parseInt(maxDownload);
    }

    if (minUpload) {
        currentFilters.min_upload_speed = parseInt(minUpload);
    }

    // Reset to first page and apply filters
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
    contractFilter.value = '';
    wirelessFilter.value = '';
    minDownloadFilter.value = '';
    maxDownloadFilter.value = '';
    minUploadFilter.value = '';
    currentFilters = {};
    currentPage = 1;
    applyFiltersAndRender();
}

// Update pagination controls
function updatePaginationControls() {
    const totalPages = getTotalPages();

    pageInfo.textContent = `Page ${currentPage} of ${totalPages} (${currentPlans.length} plans shown)`;

    firstBtn.disabled = currentPage <= 1;
    prevBtn.disabled = currentPage <= 1;
    nextBtn.disabled = currentPage >= totalPages;
    lastBtn.disabled = currentPage >= totalPages;
}

// Render plans in the table
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

// Create a plan card HTML for mobile
function createPlanCard(plan) {
    const hasPromo = plan.promo_value && plan.promo_type;
    const promoPrice = plan.promo_price || calculatePromoPrice(plan);

    // Get provider data for rating
    const provider = getProviderById(plan.provider_id);
    const hasRating = provider && provider.review_data && (provider.review_data.rating || provider.review_data.nbn_rating);

    // Create provider cell with link (rating will be in separate card detail)
    const providerContent = plan.provider_website
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
                ${providerContent}
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
                    <div class="plan-card-detail-label">Rating</div>
                    <div class="plan-card-detail-value">${formatPercentageRating(plan.provider_id, true) || (hasRating ? formatRatingDisplay(provider.review_data, true) : '<span class="rating-unavailable">No rating</span>')}</div>
                </div>
                <div class="plan-card-detail">
                    <div class="plan-card-detail-label">Contract</div>
                    <div class="plan-card-detail-value">${plan.contract_length ? `${plan.contract_length} months` : 'No lock-in'}</div>
                </div>
            </div>
            ${promoContent}
        </div>
    `;
}

// Create a plan table row HTML
function createPlanRow(plan) {
    const hasPromo = plan.promo_value && plan.promo_type;
    const promoPrice = plan.promo_price || calculatePromoPrice(plan);

    // Get provider data for rating
    const provider = getProviderById(plan.provider_id);
    const hasRating = provider && provider.review_data && (provider.review_data.rating || provider.review_data.nbn_rating);

    // Create provider cell with link (no rating here since it has its own column)
    const providerContent = plan.provider_website
        ? `<a href="${plan.provider_website}" target="_blank" rel="noopener noreferrer" class="provider-link">${plan.provider_name || 'Unknown'}</a>`
        : `<span class="provider-name">${plan.provider_name || 'Unknown'}</span>`;

    // Create fixed wireless indicator if applicable
    const fixedWirelessIcon = plan.fixed_wireless
        ? `<span class="fixed-wireless-info" title="Fixed Wireless NBN" style="margin-left: 5px; color: #8b5cf6; font-weight: bold; font-size: 8px; cursor: help; background: #f3f0ff; padding: 1px 4px; border-radius: 3px;">FW</span>`
        : '';

    const planNameCell = `${plan.plan_name}${fixedWirelessIcon}`;

    // Create rating cell content (prefer new percentage system)
    const ratingContent = formatPercentageRating(plan.provider_id, false) ||
        (hasRating ? formatRatingDisplay(provider.review_data, false) : '<span class="rating-unavailable">No rating</span>');

    return `
        <tr>
            <td class="provider-cell">${providerContent}</td>
            <td class="rating-cell">${ratingContent}</td>
            <td class="plan-cell" title="${plan.plan_name}">${planNameCell}</td>
            <td class="speed-cell">${formatSpeed(plan)}</td>
            <td class="price-cell">$${plan.monthly_price.toFixed(2)}</td>
            <td class="promo-price-cell ${hasPromo ? '' : 'no-promo'}">${hasPromo ? `$${promoPrice.toFixed(2)}` : '-'}</td>
            <td class="promo-cell ${hasPromo ? '' : 'no-promo'}">
                ${hasPromo ? formatPromotion(plan) : '-'}
            </td>
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
    if (!plan.promo_value || !plan.promo_type) return '';

    switch (plan.promo_type.toLowerCase()) {
        case 'discount':
            return `$${plan.promo_value.toFixed(2)} off ${plan.promo_duration ? `${plan.promo_duration}mo` : ''}`;
        case 'free_months':
            return `${plan.promo_value} months free`;
        default:
            return `${plan.promo_type}`;
    }
}

// UI State Management
function showLoading() {
    loadingEl.classList.remove('hidden');
    plansContainer.innerHTML = '';
    cardsContainer.innerHTML = '';
}

function hideLoading() {
    loadingEl.classList.add('hidden');
}

function showError() {
    errorEl.classList.remove('hidden');
    plansContainer.innerHTML = '';
    cardsContainer.innerHTML = '';
}

function hideError() {
    errorEl.classList.add('hidden');
}

function showNoResults() {
    noResultsEl.classList.remove('hidden');
    plansContainer.innerHTML = '';
    cardsContainer.innerHTML = '';
}

function hideNoResults() {
    noResultsEl.classList.add('hidden');
}

// Utility function to format currency
function formatCurrency(amount) {
    return new Intl.NumberFormat('en-AU', {
        style: 'currency',
        currency: 'AUD'
    }).format(amount);
}

// Get provider by plan's provider_id
function getProviderById(providerId) {
    return allProviders.find(provider => provider.id == providerId);
}

// Format rating stars display
function formatRatingStars(rating) {
    if (!rating || rating < 1 || rating > 5) return '';

    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 >= 0.5;
    const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);

    let stars = '';

    // Full stars
    for (let i = 0; i < fullStars; i++) {
        stars += '★';
    }

    // Half star
    if (hasHalfStar) {
        stars += '☆';
    }

    // Empty stars
    for (let i = 0; i < emptyStars; i++) {
        stars += '☆';
    }

    return stars;
}

// Format rating display with tooltip
// Format percentage-based rating display (new ProductReview system)
function formatPercentageRating(providerId, compact = false) {
    const ratingData = allRatings[providerId];
    if (!ratingData) {
        return compact ? '' : '<span class="rating-unavailable">No rating</span>';
    }

    const positive = ratingData.positive_percent;
    const negative = ratingData.negative_percent;
    const total = ratingData.total_reviews;

    if (compact) {
        return `
            <div class="rating-percentage-compact">
                <span class="positive">${positive}%</span>
                <span class="negative">${negative}%</span>
            </div>
        `;
    } else {
        return `
            <div class="rating-percentage">
                <div class="rating-percentage-row">
                    <span class="positive">${positive}% POSITIVE</span>
                    <span class="negative">${negative}% NEGATIVE</span>
                </div>
                <div class="rating-count">${total.toLocaleString()} reviews</div>
            </div>
        `;
    }
}

// Legacy star rating display (fallback for providers without percentage data)
function formatRatingDisplay(reviewData, compact = false) {
    if (!reviewData || (!reviewData.rating && !reviewData.nbn_rating)) {
        return compact ? '' : '<span class="rating-unavailable">No rating</span>';
    }

    // Prefer NBN-specific rating if available
    const rating = reviewData.nbn_rating || reviewData.rating;
    const reviewCount = reviewData.nbn_review_count || reviewData.review_count;
    const ratingType = reviewData.nbn_rating ? 'NBN' : 'General';

    if (!rating) return compact ? '' : '<span class="rating-unavailable">No rating</span>';

    const stars = formatRatingStars(rating);
    const ratingText = rating.toFixed(1);
    const countText = reviewCount ? ` (${reviewCount} reviews)` : '';

    // Build tooltip content
    const tooltipContent = `${ratingType} Rating: ${ratingText}/5${countText}`;

    if (compact) {
        return `<span class="rating-compact" title="${tooltipContent}">${stars}</span>`;
    } else {
        return `
            <div class="rating-display" title="${tooltipContent}">
                <span class="rating-stars">${stars}</span>
                <span class="rating-value">${ratingText}</span>
                ${reviewCount ? `<span class="rating-count">(${reviewCount})</span>` : ''}
            </div>
        `;
    }
}