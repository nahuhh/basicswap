
(function() {
  'use strict';

  const SettingsPage = {
    confirmCallback: null,
    triggerElement: null,

    originalConnectionTypes: {},

    init: function() {
      this.setupTabs();
      this.setupCoinHeaders();
      this.setupConfirmModal();
      this.setupNotificationSettings();
      this.setupMigrationIndicator();
      this.setupServerDiscovery();
      this.setupDaemonValidation();
      this.setupDaemonNodes();
    },

    setupTabs: function() {
      const tabButtons = document.querySelectorAll('.tab-button');
      const tabContents = document.querySelectorAll('.tab-content');

      const switchTab = (targetTab) => {
        tabButtons.forEach(btn => {
          if (btn.dataset.tab === targetTab) {
            btn.className = 'tab-button border-b-2 border-blue-500 text-blue-600 dark:text-blue-400 py-4 px-1 text-sm font-medium focus:outline-none focus:ring-0';
          } else {
            btn.className = 'tab-button border-b-2 border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600 py-4 px-1 text-sm font-medium focus:outline-none focus:ring-0';
          }
        });

        tabContents.forEach(content => {
          if (content.id === targetTab) {
            content.classList.remove('hidden');
          } else {
            content.classList.add('hidden');
          }
        });
      };

      tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
          switchTab(btn.dataset.tab);
        });
      });
    },

    setupCoinHeaders: function() {
      const coinHeaders = document.querySelectorAll('.coin-header');
      coinHeaders.forEach(header => {
        header.addEventListener('click', function() {
          const coinName = this.dataset.coin;
          const details = document.getElementById(`details-${coinName}`);
          const arrow = this.querySelector('.toggle-arrow');

          if (details.classList.contains('hidden')) {
            details.classList.remove('hidden');
            arrow.style.transform = 'rotate(180deg)';
          } else {
            details.classList.add('hidden');
            arrow.style.transform = 'rotate(0deg)';
          }
        });
      });
    },

    pendingModeSwitch: null,

    setupMigrationIndicator: function() {
      const connectionTypeSelects = document.querySelectorAll('select[name^="connection_type_"]');
      connectionTypeSelects.forEach(select => {
        const originalValue = select.dataset.originalValue || select.value;
        this.originalConnectionTypes[select.name] = originalValue;

        select.addEventListener('change', (e) => {
          const coinName = select.name.replace('connection_type_', '');
          const electrumSection = document.getElementById(`electrum-section-${coinName}`);
          const fundTransferSection = document.getElementById(`fund-transfer-section-${coinName}`);
          const originalValue = this.originalConnectionTypes[select.name];

          if (e.target.value === 'electrum') {
            if (electrumSection) {
              electrumSection.classList.remove('hidden');

              const clearnetTextarea = document.getElementById(`electrum_clearnet_${coinName}`);
              const onionTextarea = document.getElementById(`electrum_onion_${coinName}`);

              if (clearnetTextarea && !clearnetTextarea.value.trim()) {
                clearnetTextarea.value = electrumSection.dataset.defaultClearnet || '';
              }
              if (onionTextarea && !onionTextarea.value.trim()) {
                onionTextarea.value = electrumSection.dataset.defaultOnion || '';
              }
            }
            if (fundTransferSection) {
              fundTransferSection.classList.add('hidden');
            }
          } else {
            if (electrumSection) {
              electrumSection.classList.add('hidden');
            }
            if (fundTransferSection && originalValue === 'electrum') {
              fundTransferSection.classList.remove('hidden');
            }
          }
        });
      });

      this.setupWalletModeModal();

      const coinsForm = document.getElementById('coins-form');
      if (coinsForm) {
        coinsForm.addEventListener('submit', (e) => {
          const submitter = e.submitter;
          if (!submitter || !submitter.name.startsWith('apply_')) return;

          const coinName = submitter.name.replace('apply_', '');
          const select = document.querySelector(`select[name="connection_type_${coinName}"]`);
          if (!select) return;

          const original = this.originalConnectionTypes[select.name];
          const current = select.value;

          if (original && current && original !== current) {
            e.preventDefault();
            const direction = (original === 'rpc' && current === 'electrum') ? 'lite' : 'rpc';
            this.showWalletModeConfirmation(coinName, direction, submitter);
          }
        });
      }
    },

    setupWalletModeModal: function() {
      const confirmBtn = document.getElementById('walletModeConfirm');
      const cancelBtn = document.getElementById('walletModeCancel');

      if (confirmBtn) {
        confirmBtn.addEventListener('click', () => {
          this.hideWalletModeModal();
          if (this.pendingModeSwitch) {
            const { coinName, direction, submitter } = this.pendingModeSwitch;
            this.showMigrationModal(coinName.toUpperCase(), direction);
            const form = submitter.form;
            const hiddenInput = document.createElement('input');
            hiddenInput.type = 'hidden';
            hiddenInput.name = submitter.name;
            hiddenInput.value = submitter.value;
            form.appendChild(hiddenInput);

            let transferValue = null;
            const transferRadio = document.querySelector('input[name="transfer_choice"]:checked');
            const transferHidden = document.querySelector('input[name="transfer_choice"][type="hidden"]');
            if (transferRadio) {
              transferValue = transferRadio.value;
            } else if (transferHidden) {
              transferValue = transferHidden.value;
            }
            if (transferValue) {
              const transferInput = document.createElement('input');
              transferInput.type = 'hidden';
              transferInput.name = `auto_transfer_now_${coinName}`;
              transferInput.value = transferValue === 'auto' ? 'true' : 'false';
              form.appendChild(transferInput);
            }

            form.submit();
          }
        });
      }

      if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
          this.hideWalletModeModal();
          if (this.pendingModeSwitch) {
            const { coinName } = this.pendingModeSwitch;
            const select = document.querySelector(`select[name="connection_type_${coinName}"]`);
            if (select) {
              select.value = this.originalConnectionTypes[select.name];
            }
          }
          this.pendingModeSwitch = null;
        });
      }
    },

    updateConfirmButtonState: function() {
      const confirmBtn = document.getElementById('walletModeConfirm');
      const checkbox = document.getElementById('walletModeKeyConfirmCheckbox');
      if (confirmBtn && checkbox) {
        if (checkbox.checked) {
          confirmBtn.disabled = false;
          confirmBtn.classList.remove('opacity-50', 'cursor-not-allowed');
        } else {
          confirmBtn.disabled = true;
          confirmBtn.classList.add('opacity-50', 'cursor-not-allowed');
        }
      }
    },

    showWalletModeConfirmation: async function(coinName, direction, submitter) {
      const modal = document.getElementById('walletModeModal');
      const title = document.getElementById('walletModeTitle');
      const message = document.getElementById('walletModeMessage');
      const details = document.getElementById('walletModeDetails');
      const confirmBtn = document.getElementById('walletModeConfirm');

      if (!modal || !title || !message || !details) return;

      this.pendingModeSwitch = { coinName, direction, submitter };

      const displayName = coinName.charAt(0).toUpperCase() + coinName.slice(1).toLowerCase();

      details.innerHTML = `
        <div class="flex items-center justify-center py-4">
          <svg class="animate-spin h-5 w-5 text-blue-500 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span>Loading...</span>
        </div>
      `;

      if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.classList.add('opacity-50', 'cursor-not-allowed');
      }

      modal.classList.remove('hidden');

      if (direction === 'lite') {
        title.textContent = `Switch ${displayName} to Lite Wallet Mode`;
        message.textContent = 'Write down this key before switching. It will only be shown ONCE.';

        try {
          const [infoResponse, seedResponse] = await Promise.all([
            fetch('/json/modeswitchinfo', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ coin: coinName, direction: 'lite' })
            }),
            fetch('/json/getcoinseed', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ coin: coinName })
            })
          ]);
          const info = await infoResponse.json();
          const data = await seedResponse.json();

          let transferSection = '';
          if (info.require_transfer && info.legacy_balance_sats > 0) {
            transferSection = `
              <div class="bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-500 rounded-lg p-3 mb-3">
                <p class="text-sm font-medium text-gray-900 dark:text-white mb-2">Funds Transfer Required</p>
                <p class="text-xs text-gray-700 dark:text-gray-200 mb-2">
                  <strong>${info.legacy_balance} ${info.coin}</strong> on non-derivable addresses will be automatically transferred to a BIP84 address.
                </p>
                <p class="text-xs text-gray-600 dark:text-gray-300 mb-2">
                  Est. fee: ${info.estimated_fee} ${info.coin}
                </p>
                <p class="text-xs text-gray-700 dark:text-gray-200">
                  This ensures your funds are recoverable using the extended key backup in external Electrum wallets.
                </p>
                <input type="hidden" name="transfer_choice" value="auto">
              </div>
            `;
          } else if (info.legacy_balance_sats > 0 && !info.show_transfer_option) {
            transferSection = `
              <p class="text-gray-700 dark:text-gray-300 text-xs mb-3">
                Some funds on non-derivable addresses (${info.legacy_balance} ${info.coin}) - too low to transfer.
              </p>
            `;
          }

          if (data.account_key) {
            details.innerHTML = `
              <p class="mb-2 text-red-600 dark:text-red-300 font-semibold">
                IMPORTANT: Write down this key NOW. It will not be shown again.
              </p>
              <p class="mb-2 text-gray-800 dark:text-gray-100"><strong>Extended Private Key (for external wallet import):</strong></p>
              <div class="bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-500 rounded p-2 mb-3">
                <code id="extendedKeyDisplay" class="text-xs break-all font-mono text-gray-900 dark:text-gray-100">${'*'.repeat(Math.min(data.account_key.length, 80))}</code>
                <code id="extendedKeyActual" class="text-xs break-all select-all font-mono text-gray-900 dark:text-gray-100 hidden">${data.account_key}</code>
              </div>
              <div class="mb-3">
                <button type="button" id="toggleKeyVisibility" class="px-3 py-1 text-xs bg-blue-500 hover:bg-blue-600 text-white rounded">
                  Show Key
                </button>
              </div>
              <div class="text-xs text-gray-600 dark:text-gray-300 mb-3 bg-gray-100 dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded p-2">
                <p class="font-medium mb-1 text-gray-800 dark:text-gray-100">To import in Electrum wallet:</p>
                <ol class="list-decimal list-inside space-y-0.5">
                  <li>Open Electrum → File → New/Restore</li>
                  <li>Choose "Standard wallet" → "Use a master key"</li>
                  <li>Paste this key (starts with zprv... or yprv...)</li>
                </ol>
              </div>
              ${transferSection}
              <div class="border-t border-gray-300 dark:border-gray-500 pt-3">
                <label class="flex items-center cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-500 rounded p-1 -m-1">
                  <input type="checkbox" id="walletModeKeyConfirmCheckbox" class="mr-2 h-4 w-4 text-blue-600 rounded border-gray-300 dark:border-gray-500 focus:ring-blue-500 dark:bg-gray-700">
                  <span class="text-sm font-medium text-gray-800 dark:text-gray-100">I have written down this key</span>
                </label>
              </div>
            `;

            const toggleBtn = document.getElementById('toggleKeyVisibility');
            const keyDisplay = document.getElementById('extendedKeyDisplay');
            const keyActual = document.getElementById('extendedKeyActual');
            if (toggleBtn && keyDisplay && keyActual) {
              toggleBtn.addEventListener('click', () => {
                if (keyDisplay.classList.contains('hidden')) {
                  keyDisplay.classList.remove('hidden');
                  keyActual.classList.add('hidden');
                  toggleBtn.textContent = 'Show Key';
                } else {
                  keyDisplay.classList.add('hidden');
                  keyActual.classList.remove('hidden');
                  toggleBtn.textContent = 'Hide Key';
                }
              });
            }

            const checkbox = document.getElementById('walletModeKeyConfirmCheckbox');
            if (checkbox) {
              checkbox.addEventListener('change', () => this.updateConfirmButtonState());
            }
          } else {
            details.innerHTML = `
              <p class="mb-2 text-gray-800 dark:text-gray-100"><strong>Before switching:</strong></p>
              <ul class="list-disc list-inside space-y-1 text-gray-700 dark:text-gray-200">
                <li>Active swaps must be completed first</li>
                <li>Wait for any pending transactions to confirm</li>
              </ul>
              ${transferSection}
              <p class="mt-3 text-green-700 dark:text-green-300">
                <strong>Note:</strong> Your balance will remain accessible - same seed means same funds in both modes.
              </p>
            `;
            if (confirmBtn) {
              confirmBtn.disabled = false;
              confirmBtn.classList.remove('opacity-50', 'cursor-not-allowed');
            }
          }
        } catch (error) {
          console.error('Failed to fetch coin seed:', error);
          details.innerHTML = `
            <p class="text-red-600 dark:text-red-300 mb-2">Failed to retrieve extended key. Please try again.</p>
            <p class="mb-2 text-gray-800 dark:text-gray-100"><strong>Before switching:</strong></p>
            <ul class="list-disc list-inside space-y-1 text-gray-700 dark:text-gray-200">
              <li>Active swaps must be completed first</li>
              <li>Wait for any pending transactions to confirm</li>
            </ul>
          `;
          if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.classList.remove('opacity-50', 'cursor-not-allowed');
          }
        }
      } else {
        title.textContent = `Switch ${displayName} to Full Node Mode`;
        message.textContent = 'Please confirm you want to switch to full node mode.';

        try {
          const response = await fetch('/json/modeswitchinfo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ coin: coinName, direction: 'rpc' })
          });
          const info = await response.json();

          let transferSection = '';
          if (info.error) {
            transferSection = `<p class="text-yellow-700 dark:text-yellow-300 text-sm">${info.error}</p>`;
          } else if (info.balance_sats === 0) {
            transferSection = `<p class="text-gray-600 dark:text-gray-300 text-sm">No funds to transfer.</p>`;
          } else if (!info.can_transfer) {
            transferSection = `
              <p class="text-yellow-700 dark:text-yellow-300 text-sm">
                Balance (${info.balance} ${info.coin}) is too low to transfer - fee would exceed funds.
              </p>
            `;
          } else {
            transferSection = `
              <div class="bg-gray-200 dark:bg-gray-700 border border-gray-300 dark:border-gray-500 rounded-lg p-3 mb-3">
                <p class="text-sm font-medium text-gray-900 dark:text-white mb-2">Fund Transfer Options</p>
                <p class="text-xs text-gray-700 dark:text-gray-300 mb-3">
                  Balance: ${info.balance} ${info.coin} | Est. fee: ${info.estimated_fee} ${info.coin}
                </p>
                <div class="space-y-2">
                  <label class="flex items-start cursor-pointer hover:bg-gray-300 dark:hover:bg-gray-600 rounded p-1.5 -m-1">
                    <input type="radio" name="transfer_choice" value="auto" checked class="mt-0.5 mr-2 h-4 w-4 text-blue-600 border-gray-400 dark:border-gray-400 focus:ring-blue-500 bg-white dark:bg-gray-500">
                    <div>
                      <span class="text-sm font-medium text-gray-900 dark:text-white">Auto-transfer funds to RPC wallet</span>
                      <p class="text-xs text-gray-600 dark:text-gray-300">Recommended. Ensures all funds visible in full node wallet.</p>
                    </div>
                  </label>
                  <label class="flex items-start cursor-pointer hover:bg-gray-300 dark:hover:bg-gray-600 rounded p-1.5 -m-1">
                    <input type="radio" name="transfer_choice" value="manual" class="mt-0.5 mr-2 h-4 w-4 text-blue-600 border-gray-400 dark:border-gray-400 focus:ring-blue-500 bg-white dark:bg-gray-500">
                    <div>
                      <span class="text-sm font-medium text-gray-900 dark:text-white">Keep funds on current addresses</span>
                      <p class="text-xs text-gray-600 dark:text-gray-300">Transfer manually later if needed.</p>
                    </div>
                  </label>
                </div>
                <p class="text-xs text-gray-600 dark:text-gray-400 mt-3">
                  If you skip transfer, you will need to manually send funds from lite wallet addresses to your RPC wallet.
                </p>
              </div>
            `;
          }

          details.innerHTML = `
            <p class="mb-2 text-gray-800 dark:text-gray-100"><strong>Switching to full node mode:</strong></p>
            <ul class="list-disc list-inside space-y-1 mb-3 text-gray-700 dark:text-gray-200">
              <li>Requires synced ${displayName} blockchain</li>
              <li>Your wallet addresses will be synced</li>
              <li>Active swaps must be completed first</li>
              <li>Restart required after switch</li>
            </ul>
            ${transferSection}
          `;

          if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.classList.remove('opacity-50', 'cursor-not-allowed');
          }
        } catch (error) {
          console.error('Failed to fetch mode switch info:', error);
          details.innerHTML = `
            <p class="mb-2 text-gray-800 dark:text-gray-100"><strong>Switching to full node mode:</strong></p>
            <ul class="list-disc list-inside space-y-1 text-gray-700 dark:text-gray-200">
              <li>Requires synced ${displayName} blockchain</li>
              <li>Your wallet addresses will be synced</li>
              <li>Active swaps must be completed first</li>
              <li>Restart required after switch</li>
            </ul>
          `;
          if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.classList.remove('opacity-50', 'cursor-not-allowed');
          }
        }
      }
    },

    hideWalletModeModal: function() {
      const modal = document.getElementById('walletModeModal');
      if (modal) {
        modal.classList.add('hidden');
      }
    },

    showMigrationModal: function(coinName, direction) {
      const modal = document.getElementById('migrationModal');
      const title = document.getElementById('migrationTitle');
      const message = document.getElementById('migrationMessage');

      if (modal && title && message) {
        if (direction === 'lite') {
          title.textContent = `Migrating ${coinName} to Lite Wallet`;
          message.textContent = 'Checking wallet balance and migrating addresses. Please wait...';
        } else {
          title.textContent = `Switching ${coinName} to Full Node`;
          message.textContent = 'Syncing wallet indices. Please wait...';
        }
        modal.classList.remove('hidden');
      }
    },

    setupConfirmModal: function() {
      const confirmYesBtn = document.getElementById('confirmYes');
      if (confirmYesBtn) {
        confirmYesBtn.addEventListener('click', () => {
          if (typeof this.confirmCallback === 'function') {
            this.confirmCallback();
          }
          this.hideConfirmDialog();
        });
      }

      const confirmNoBtn = document.getElementById('confirmNo');
      if (confirmNoBtn) {
        confirmNoBtn.addEventListener('click', () => {
          this.hideConfirmDialog();
        });
      }
    },

    showConfirmDialog: function(title, message, callback) {
      this.confirmCallback = callback;
      document.getElementById('confirmTitle').textContent = title;
      document.getElementById('confirmMessage').textContent = message;
      const modal = document.getElementById('confirmModal');
      if (modal) {
        modal.classList.remove('hidden');
      }
      return false;
    },

    hideConfirmDialog: function() {
      const modal = document.getElementById('confirmModal');
      if (modal) {
        modal.classList.add('hidden');
      }
      this.confirmCallback = null;
      return false;
    },

    confirmDisableCoin: function() {
      this.triggerElement = document.activeElement;
      return this.showConfirmDialog(
        "Confirm Disable Coin",
        "Are you sure you want to disable this coin?",
        () => {
          if (this.triggerElement) {
            const form = this.triggerElement.form;
            const hiddenInput = document.createElement('input');
            hiddenInput.type = 'hidden';
            hiddenInput.name = this.triggerElement.name;
            hiddenInput.value = this.triggerElement.value;
            form.appendChild(hiddenInput);
            form.submit();
          }
        }
      );
    },

    setupNotificationSettings: function() {
      const notificationsTab = document.getElementById('notifications-tab');
      if (notificationsTab) {
        notificationsTab.addEventListener('click', () => {
          CleanupManager.setTimeout(() => this.syncNotificationSettings(), 100);
        });
      }

      document.addEventListener('change', (e) => {
        if (e.target.closest('#notifications')) {
          this.syncNotificationSettings();
        }
      });

      this.syncNotificationSettings();
    },

    syncNotificationSettings: function() {
      if (window.NotificationManager && typeof window.NotificationManager.updateSettings === 'function') {
        const backendSettings = {
          showNewOffers: document.getElementById('notifications_new_offers')?.checked || false,
          showNewBids: document.getElementById('notifications_new_bids')?.checked || false,
          showBidAccepted: document.getElementById('notifications_bid_accepted')?.checked || false,
          showBalanceChanges: document.getElementById('notifications_balance_changes')?.checked || false,
          showOutgoingTransactions: document.getElementById('notifications_outgoing_transactions')?.checked || false,
          showSwapCompleted: document.getElementById('notifications_swap_completed')?.checked || false,
          showUpdateNotifications: document.getElementById('check_updates')?.checked || false,
          notificationDuration: parseInt(document.getElementById('notifications_duration')?.value || '5') * 1000
        };

        window.NotificationManager.updateSettings(backendSettings);
      }
    },

    testUpdateNotification: function() {
      if (window.NotificationManager) {
        window.NotificationManager.createToast(
          'Update Available: v0.15.0',
          'update_available',
          {
            subtitle: 'Current: v0.14.6 • Click to view release (Test/Dummy)',
            releaseUrl: 'https://github.com/basicswap/basicswap/releases/tag/v0.15.0',
            releaseNotes: 'New version v0.15.0 is available. Click to view details on GitHub.'
          }
        );
      }
    },

    testLiveUpdateCheck: function(event) {
      const button = event?.target || event?.currentTarget || document.querySelector('[onclick*="testLiveUpdateCheck"]');
      if (!button) return;

      const originalText = button.textContent;
      button.textContent = 'Checking...';
      button.disabled = true;

      fetch('/json/checkupdates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      })
      .then(response => response.json())
      .then(data => {
        if (window.NotificationManager) {
          const currentVer = data.current_version || 'Unknown';
          const latestVer = data.latest_version || currentVer;

          if (data.update_available) {
            window.NotificationManager.createToast(
              `Live Update Available: v${latestVer}`,
              'update_available',
              {
                latest_version: latestVer,
                current_version: currentVer,
                subtitle: `Current: v${currentVer} • Click to view release`,
                releaseUrl: `https://github.com/basicswap/basicswap/releases/tag/v${latestVer}`,
                releaseNotes: 'This is a real update check from GitHub API.'
              }
            );
          } else {
            window.NotificationManager.createToast(
              'No Updates Available',
              'success',
              {
                subtitle: `Current version v${currentVer} is up to date`
              }
            );
          }
        }
      })
      .catch(error => {
        console.error('Update check failed:', error);
        if (window.NotificationManager) {
          window.NotificationManager.createToast(
            'Update Check Failed',
            'error',
            {
              subtitle: 'Could not check for updates. See console for details.'
            }
          );
        }
      })
      .finally(() => {
        if (button) {
          button.textContent = originalText;
          button.disabled = false;
        }
      });
    },

    checkForUpdatesNow: function(event) {
      const button = event?.target || event?.currentTarget || document.querySelector('[data-check-updates]');
      if (!button) return;

      const originalText = button.textContent;
      button.textContent = 'Checking...';
      button.disabled = true;

      fetch('/json/checkupdates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      })
      .then(response => response.json())
      .then(data => {
        if (data.error) {
          if (window.NotificationManager) {
            window.NotificationManager.createToast(
              'Update Check Failed',
              'error',
              {
                subtitle: data.error
              }
            );
          }
          return;
        }

        if (window.NotificationManager) {
          const currentVer = data.current_version || 'Unknown';
          const latestVer = data.latest_version || currentVer;

          if (data.update_available) {
            window.NotificationManager.createToast(
              `Update Available: v${latestVer}`,
              'update_available',
              {
                latest_version: latestVer,
                current_version: currentVer,
                subtitle: `Current: v${currentVer} • Click to view release`,
                releaseUrl: `https://github.com/basicswap/basicswap/releases/tag/v${latestVer}`,
                releaseNotes: `New version v${latestVer} is available. Click to view details on GitHub.`
              }
            );
          } else {
            window.NotificationManager.createToast(
              'You\'re Up to Date!',
              'success',
              {
                subtitle: `Current version v${currentVer} is the latest`
              }
            );
          }
        }
      })
      .catch(error => {
        console.error('Update check failed:', error);
        if (window.NotificationManager) {
          window.NotificationManager.createToast(
            'Update Check Failed',
            'error',
            {
              subtitle: 'Network error. Please try again later.'
            }
          );
        }
      })
      .finally(() => {
        if (button) {
          button.textContent = originalText;
          button.disabled = false;
        }
      });
    }
  };

  SettingsPage.setupServerDiscovery = function() {
    const discoverBtns = document.querySelectorAll('.discover-servers-btn');
    discoverBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const coin = btn.dataset.coin;
        this.discoverServers(coin, btn);
      });
    });

    const closeBtns = document.querySelectorAll('.close-discovered-btn');
    closeBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const coin = btn.dataset.coin;
        const panel = document.getElementById(`discovered-servers-${coin}`);
        if (panel) panel.classList.add('hidden');
      });
    });
  };

  SettingsPage.discoverServers = function(coin, button) {
    const originalHtml = button.innerHTML;
    button.innerHTML = `<svg class="w-3.5 h-3.5 mr-1 animate-spin inline-block" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>Discovering...`;
    button.disabled = true;

    const panel = document.getElementById(`discovered-servers-${coin}`);
    const listContainer = document.getElementById(`discovered-list-${coin}`);

    fetch('/json/electrumdiscover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ coin: coin, ping: true })
    })
    .then(response => response.json())
    .then(data => {
      if (data.error) {
        listContainer.innerHTML = `<div class="text-sm text-red-500">${data.error}</div>`;
      } else {
        let html = '';

        if (data.current_server) {
          html += `
            <div class="flex items-center mb-4 p-3 bg-gray-100 dark:bg-gray-600 border border-gray-200 dark:border-gray-500 rounded-lg">
              <span class="w-2 h-2 bg-green-500 rounded-full mr-3 animate-pulse"></span>
              <span class="text-sm text-gray-900 dark:text-white">
                Connected to: <span class="font-mono font-medium">${data.current_server.host}:${data.current_server.port}</span>
              </span>
            </div>`;
        }

        if (data.clearnet_servers && data.clearnet_servers.length > 0) {
          html += `
            <div class="mb-4">
              <div class="text-sm font-semibold text-gray-900 dark:text-white mb-2 pb-2 border-b border-gray-200 dark:border-gray-600">
                Clearnet
              </div>
              <div class="space-y-1">`;
          data.clearnet_servers.forEach(srv => {
            const statusClass = srv.online ? 'text-green-600 dark:text-green-400' : 'text-gray-400 dark:text-gray-500';
            const statusText = srv.online ? (srv.latency_ms ? srv.latency_ms.toFixed(0) + 'ms' : 'online') : 'offline';
            const statusDot = srv.online ? 'bg-green-500' : 'bg-gray-400';
            html += `
                <div class="flex items-center justify-between py-2 px-3 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-lg cursor-pointer add-server-btn transition-colors border border-transparent hover:border-blue-500"
                     data-coin="${coin}" data-host="${srv.host}" data-port="${srv.port}" data-type="clearnet">
                  <div class="flex items-center flex-1 min-w-0">
                    <svg class="w-4 h-4 mr-2 text-blue-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path>
                    </svg>
                    <span class="font-mono text-sm text-gray-900 dark:text-white truncate">${srv.host}:${srv.port}</span>
                  </div>
                  <div class="flex items-center ml-3">
                    <span class="w-2 h-2 ${statusDot} rounded-full mr-2"></span>
                    <span class="text-xs ${statusClass}">${statusText}</span>
                  </div>
                </div>`;
          });
          html += `
              </div>
            </div>`;
        }

        if (data.onion_servers && data.onion_servers.length > 0) {
          html += `
            <div class="mb-4">
              <div class="text-sm font-semibold text-gray-900 dark:text-white mb-2 pb-2 border-b border-gray-200 dark:border-gray-600">
                TOR (.onion)
              </div>
              <div class="space-y-1">`;
          data.onion_servers.forEach(srv => {
            const statusClass = srv.online ? 'text-green-600 dark:text-green-400' : 'text-gray-400 dark:text-gray-500';
            const statusText = srv.online ? (srv.latency_ms ? srv.latency_ms.toFixed(0) + 'ms' : 'online') : 'offline';
            const statusDot = srv.online ? 'bg-green-500' : 'bg-gray-400';
            html += `
                <div class="flex items-center justify-between py-2 px-3 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-lg cursor-pointer add-server-btn transition-colors border border-transparent hover:border-blue-500"
                     data-coin="${coin}" data-host="${srv.host}" data-port="${srv.port}" data-type="onion">
                  <div class="flex items-center flex-1 min-w-0">
                    <svg class="w-4 h-4 mr-2 text-blue-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path>
                    </svg>
                    <span class="font-mono text-sm text-gray-900 dark:text-white truncate" title="${srv.host}">${srv.host.substring(0, 24)}...:${srv.port}</span>
                  </div>
                  <div class="flex items-center ml-3">
                    <span class="w-2 h-2 ${statusDot} rounded-full mr-2"></span>
                    <span class="text-xs ${statusClass}">${statusText}</span>
                  </div>
                </div>`;
          });
          html += `
              </div>
            </div>`;
        }

        if (!data.clearnet_servers?.length && !data.onion_servers?.length) {
          const serverName = data.current_server ? `${data.current_server.host}:${data.current_server.port}` : 'The connected server';
          html = `<div class="text-sm text-gray-500 dark:text-gray-400 py-4 text-center">No servers discovered. <span class="font-mono">${serverName}</span> does not return peer lists.</div>`;
        } else {
          html += `<div class="text-xs text-gray-500 dark:text-gray-400 pt-3 border-t border-gray-200 dark:border-gray-600">Click a server to add it to your list</div>`;
        }

        listContainer.innerHTML = html;

        listContainer.querySelectorAll('.add-server-btn').forEach(item => {
          item.addEventListener('click', () => {
            const host = item.dataset.host;
            const port = item.dataset.port;
            const type = item.dataset.type;
            const coinName = item.dataset.coin;

            const textareaId = type === 'onion' ?
              `electrum_onion_${coinName}` : `electrum_clearnet_${coinName}`;
            const textarea = document.getElementById(textareaId);

            if (textarea) {
              const serverLine = `${host}:${port}`;
              const currentValue = textarea.value.trim();

              if (currentValue.split('\n').some(line => line.trim() === serverLine)) {
                item.classList.add('bg-yellow-100', 'dark:bg-yellow-800/30');
                setTimeout(() => item.classList.remove('bg-yellow-100', 'dark:bg-yellow-800/30'), 500);
                return;
              }

              textarea.value = currentValue ? currentValue + '\n' + serverLine : serverLine;
              item.classList.add('bg-green-100', 'dark:bg-green-800/30');
              setTimeout(() => item.classList.remove('bg-green-100', 'dark:bg-green-800/30'), 500);
            }
          });
        });
      }

      panel.classList.remove('hidden');
    })
    .catch(err => {
      listContainer.innerHTML = `<div class="text-xs text-red-500">Failed to discover servers: ${err.message}</div>`;
      panel.classList.remove('hidden');
    })
    .finally(() => {
      button.innerHTML = originalHtml;
      button.disabled = false;
    });
  };

  SettingsPage.setupDaemonValidation = function() {
    const buttons = document.querySelectorAll('.apply-coin-btn');
    buttons.forEach(button => {
      const coin = button.dataset.coin;
      const hostInput = document.querySelector(`[name="rpchost_${coin}"]`);
      const portInput = document.querySelector(`[name="rpcport_${coin}"]`);
      // Only Monero/Wownero render daemon host/port fields.
      if (!hostInput || !portInput) return;

      button.addEventListener('click', (e) => {
        if (button.dataset.daemonChecked === '1') {
          button.dataset.daemonChecked = '';
          return;
        }
        // Only validate when the host/port changed; auto-select probes server-side.
        const hostChanged = hostInput.value.trim() !== hostInput.defaultValue.trim()
          || portInput.value.trim() !== portInput.defaultValue.trim();
        if (!hostChanged) return;

        e.preventDefault();
        this.validateDaemon(coin, hostInput.value.trim(), portInput.value.trim(), button);
      });
    });
  };

  SettingsPage.validateDaemon = function(coin, host, port, button) {
    const errorEl = document.getElementById(`daemon-error-${coin}`);
    const form = button.closest('form');
    const originalHtml = button.innerHTML;
    if (errorEl) { errorEl.classList.add('hidden'); errorEl.textContent = ''; }
    button.disabled = true;
    button.innerHTML = `<svg class="w-3.5 h-3.5 mr-1 animate-spin inline-block" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>Testing node...`;

    const restore = () => { button.disabled = false; button.innerHTML = originalHtml; };
    const showError = (msg) => {
      if (errorEl) { errorEl.textContent = msg; errorEl.classList.remove('hidden'); }
    };

    fetch('/json/testxmrdaemon', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ coin: coin, rpchost: host, rpcport: port })
    })
    .then(response => response.json())
    .then(data => {
      if (data.reachable) {
        restore();
        button.dataset.daemonChecked = '1';
        if (form.requestSubmit) {
          form.requestSubmit(button);
        } else {
          const hidden = document.createElement('input');
          hidden.type = 'hidden';
          hidden.name = button.name;
          hidden.value = button.value;
          form.appendChild(hidden);
          form.submit();
        }
      } else {
        showError(data.error || `Daemon ${host}:${port} is not reachable.`);
        restore();
      }
    })
    .catch(err => {
      showError(`Failed to test daemon: ${err.message}`);
      restore();
    });
  };

  // Rows are the source of truth, serialised to a hidden JSON field the form submits.
  SettingsPage.setupDaemonNodes = function() {
    const containers = document.querySelectorAll('.daemon-nodes');
    containers.forEach(container => this.initDaemonNodeList(container));
  };

  SettingsPage.initDaemonNodeList = function(container) {
    const coin = container.dataset.coin;
    const hidden = container.querySelector('.daemon-nodes-hidden');
    const listEl = container.querySelector('.daemon-node-list');
    const emptyEl = container.querySelector('.daemon-node-empty');
    const addInput = container.querySelector('.daemon-node-add-input');
    const addBtn = container.querySelector('.daemon-node-add-btn');
    const checkAllBtn = container.querySelector('.daemon-check-all');
    const hostInput = document.querySelector(`[name="rpchost_${coin}"]`);
    const portInput = document.querySelector(`[name="rpcport_${coin}"]`);
    if (!hidden || !listEl) return;

    let nodes = [];
    try {
      const parsed = JSON.parse(hidden.value || '[]');
      if (Array.isArray(parsed)) {
        nodes = parsed
          .map(n => ({
            url: String((n && n.url) || '').trim(),
            failover: !(n && n.failover === false),
            status: 'unknown',
            latency: null
          }))
          .filter(n => n.url !== '');
      }
    } catch (e) {
      nodes = [];
    }

    const serialize = () => {
      hidden.value = JSON.stringify(nodes.map(n => ({ url: n.url, failover: !!n.failover })));
    };

    const splitUrl = (url) => {
      const idx = url.lastIndexOf(':');
      return idx < 0 ? [url, ''] : [url.slice(0, idx), url.slice(idx + 1)];
    };

    const SPINNER = '<svg class="w-3.5 h-3.5 mr-1 animate-spin inline-block" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>';

    const errorEl = document.getElementById(`daemon-error-${coin}`);
    const showError = (msg) => {
      if (errorEl) { errorEl.textContent = msg; errorEl.classList.remove('hidden'); }
    };
    const clearError = () => {
      if (errorEl) { errorEl.classList.add('hidden'); errorEl.textContent = ''; }
    };

    // Persist the node list live; does not switch daemon.
    const saveNodes = () => {
      return fetch('/json/savexmrdaemonnodes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coin: coin, nodes: nodes.map(n => ({ url: n.url, failover: !!n.failover })) })
      })
        .then(r => r.json())
        .then(data => {
          if (!(data && data.success)) showError((data && data.error) || 'Failed to save node list.');
        })
        .catch(() => showError('Failed to save node list.'));
    };

    // The url the wallet is currently pointed at (the manual host/port fields).
    const currentDaemonUrl = () => {
      const h = hostInput ? hostInput.value.trim() : '';
      const p = portInput ? portInput.value.trim() : '';
      return (h === '' && p === '') ? '' : `${h}:${p}`;
    };

    const healthDotClass = (statusVal) => {
      let color = 'bg-gray-300 dark:bg-gray-500';
      if (statusVal === 'ok') color = 'bg-green-500';
      else if (statusVal === 'bad') color = 'bg-red-500';
      return 'daemon-node-dot shrink-0 w-2 h-2 rounded-full ' + color;
    };

    const applyProbeVisual = (row, node) => {
      const dot = row.querySelector('.daemon-node-dot');
      const status = row.querySelector('.daemon-node-status');
      if (dot) dot.className = healthDotClass(node.status);
      if (node.status === 'ok') {
        status.className = 'daemon-node-status shrink-0 text-xs font-medium text-green-600 dark:text-green-400';
        status.textContent = node.latency + ' ms';
      } else if (node.status === 'bad') {
        status.className = 'daemon-node-status shrink-0 text-xs font-medium text-red-500';
        status.textContent = 'unreachable';
      } else {
        status.className = 'daemon-node-status shrink-0 text-xs text-gray-400 dark:text-gray-500';
        status.textContent = '';
      }
    };

    const statusRank = (n) => (n.status === 'ok' ? 0 : (n.status === 'unknown' ? 1 : 2));
    const reorder = () => {
      nodes.sort((a, b) => {
        const r = statusRank(a) - statusRank(b);
        if (r !== 0) return r;
        if (a.status === 'ok' && b.status === 'ok') return (a.latency || 0) - (b.latency || 0);
        return 0;
      });
    };

    const probeNode = (node, row) => {
      const [host, port] = splitUrl(node.url);
      const probeBtn = row.querySelector('.daemon-node-probe');
      const status = row.querySelector('.daemon-node-status');
      if (probeBtn) probeBtn.disabled = true;
      status.className = 'daemon-node-status shrink-0 text-xs text-gray-400 dark:text-gray-500';
      status.textContent = 'checking…';
      const controller = new AbortController();
      const to = setTimeout(() => controller.abort(), 20000);
      return fetch('/json/testxmrdaemon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coin: coin, rpchost: host, rpcport: port }),
        signal: controller.signal
      })
        .then(r => r.json())
        .then(data => {
          if (data.reachable) {
            node.status = 'ok';
            node.latency = (typeof data.latency_ms === 'number') ? data.latency_ms : null;
          } else {
            node.status = 'bad';
            node.latency = null;
          }
        })
        .catch(() => { node.status = 'bad'; node.latency = null; })
        .finally(() => {
          clearTimeout(to);
          if (probeBtn) probeBtn.disabled = false;
          applyProbeVisual(row, node);
        });
    };

    // Point the wallet at a node and persist it live via /json/setxmrdaemon, so
    // the selection is saved without a full page reload.
    const useNode = (node, useBtn) => {
      const [host, port] = splitUrl(node.url);
      clearError();
      useBtn.disabled = true;
      useBtn.innerHTML = SPINNER + 'Applying…';
      const controller = new AbortController();
      const to = setTimeout(() => controller.abort(), 20000);
      fetch('/json/setxmrdaemon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coin: coin, rpchost: host, rpcport: port }),
        signal: controller.signal
      })
        .then(r => r.json())
        .then(data => {
          if (data && data.success) {
            if (hostInput) { hostInput.value = host; hostInput.defaultValue = host; }
            if (portInput) { portInput.value = port; portInput.defaultValue = port; }
            node.status = 'ok';
            if (typeof data.latency_ms === 'number') node.latency = data.latency_ms;
            render();
          } else {
            showError((data && data.error) || `Failed to apply ${node.url}.`);
            useBtn.disabled = false;
            useBtn.textContent = 'Use';
          }
        })
        .catch(() => {
          showError(`Failed to apply ${node.url}.`);
          useBtn.disabled = false;
          useBtn.textContent = 'Use';
        })
        .finally(() => { clearTimeout(to); });
    };

    const buildRow = (node) => {
      const isSelected = node.url !== '' && node.url === currentDaemonUrl();
      const li = document.createElement('li');
      li.className = 'daemon-node flex items-center gap-2 flex-wrap rounded-lg border p-2 ' +
        (isSelected
          ? 'border-blue-500 ring-1 ring-blue-500 bg-white dark:bg-gray-800'
          : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800');
      li.dataset.url = node.url;

      const probeBtn = document.createElement('button');
      probeBtn.type = 'button';
      probeBtn.className = 'daemon-node-probe flex items-center gap-2 min-w-0 grow text-left cursor-pointer';
      probeBtn.title = 'Health-check this node';
      const dot = document.createElement('span');
      dot.className = healthDotClass(node.status);
      const urlSpan = document.createElement('span');
      urlSpan.className = 'daemon-node-url truncate font-mono text-sm text-gray-900 dark:text-white';
      urlSpan.textContent = node.url;
      const statusSpan = document.createElement('span');
      statusSpan.className = 'daemon-node-status shrink-0 text-xs text-gray-400 dark:text-gray-500';
      probeBtn.appendChild(dot);
      probeBtn.appendChild(urlSpan);
      probeBtn.appendChild(statusSpan);
      probeBtn.addEventListener('click', () => { probeNode(node, li).then(() => { reorder(); render(); }); });

      const actions = document.createElement('div');
      actions.className = 'daemon-node-actions flex items-center gap-1 shrink-0';

      const foLabel = document.createElement('label');
      foLabel.className = 'flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300 whitespace-nowrap cursor-pointer mr-1';
      const foCb = document.createElement('input');
      foCb.type = 'checkbox';
      foCb.className = 'daemon-node-failover w-4 h-4 text-blue-600 rounded border-gray-300';
      foCb.checked = !!node.failover;
      foCb.addEventListener('change', () => { node.failover = foCb.checked; serialize(); saveNodes(); });
      foLabel.appendChild(foCb);
      foLabel.appendChild(document.createTextNode('Failover'));

      let useControl;
      if (isSelected) {
        useControl = document.createElement('span');
        useControl.className = 'daemon-node-selected inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-blue-100 text-blue-700 dark:bg-blue-800 dark:text-white';
        useControl.innerHTML = '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>Selected';
        useControl.title = 'The wallet is currently pointed at this node';
      } else {
        useControl = document.createElement('button');
        useControl.type = 'button';
        useControl.className = 'daemon-node-use inline-flex items-center px-2.5 py-1.5 text-xs font-medium rounded-lg border border-blue-500 text-blue-600 dark:text-blue-400 hover:bg-blue-500 hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-500';
        useControl.textContent = 'Use';
        useControl.title = 'Point the wallet at this node and save';
        useControl.addEventListener('click', () => useNode(node, useControl));
      }

      const rmBtn = document.createElement('button');
      rmBtn.type = 'button';
      rmBtn.setAttribute('aria-label', 'Remove node');
      rmBtn.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>';
      if (isSelected) {
        rmBtn.disabled = true;
        rmBtn.title = "Can't remove the node the wallet is currently using";
        rmBtn.className = 'daemon-node-remove inline-flex items-center justify-center w-9 h-9 rounded-lg text-gray-300 dark:text-gray-500 cursor-not-allowed';
      } else {
        rmBtn.title = 'Remove node';
        rmBtn.className = 'daemon-node-remove inline-flex items-center justify-center w-9 h-9 rounded-lg text-gray-400 hover:text-red-600 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-red-500';
        rmBtn.addEventListener('click', () => {
          SettingsPage.showConfirmDialog(
            'Remove node',
            `Remove ${node.url} from the node list?`,
            () => { nodes = nodes.filter(n => n !== node); render(); saveNodes(); }
          );
        });
      }

      actions.appendChild(foLabel);
      actions.appendChild(useControl);
      actions.appendChild(rmBtn);

      li.appendChild(probeBtn);
      li.appendChild(actions);
      applyProbeVisual(li, node);
      return li;
    };

    const render = () => {
      listEl.innerHTML = '';
      if (emptyEl) emptyEl.classList.toggle('hidden', nodes.length !== 0);
      nodes.forEach(node => listEl.appendChild(buildRow(node)));
      serialize();
    };

    const addNode = () => {
      const raw = (addInput.value || '').trim();
      if (raw === '') return;
      if (raw.indexOf(':') < 0) { addInput.classList.add('border-red-500'); return; }
      addInput.classList.remove('border-red-500');
      if (nodes.some(n => n.url === raw)) { addInput.value = ''; return; }
      nodes.push({ url: raw, failover: true, status: 'unknown', latency: null });
      addInput.value = '';
      render();
      saveNodes();
    };

    if (addBtn) addBtn.addEventListener('click', addNode);
    if (addInput) addInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); addNode(); }
    });

    if (checkAllBtn) checkAllBtn.addEventListener('click', () => {
      if (nodes.length === 0) return;
      const label = checkAllBtn.querySelector('.daemon-check-all-label');
      const icon = checkAllBtn.querySelector('.daemon-check-all-icon');
      const origLabel = label ? label.textContent : '';
      checkAllBtn.disabled = true;
      if (label) label.textContent = 'Checking…';
      if (icon) icon.classList.add('animate-spin');
      const rows = Array.from(listEl.querySelectorAll('.daemon-node'));
      // Probe sequentially so nodes are queried one at a time (10s each server-side).
      const seq = nodes.reduce((p, node, i) => p.then(() => {
        const row = rows[i];
        return row ? probeNode(node, row) : Promise.resolve();
      }), Promise.resolve());
      seq.finally(() => {
        checkAllBtn.disabled = false;
        if (label) label.textContent = origLabel || 'Check all';
        if (icon) icon.classList.remove('animate-spin');
        reorder();
        render();
      });
    });

    render();
  };

  SettingsPage.cleanup = function() {
  };

  document.addEventListener('DOMContentLoaded', function() {
    SettingsPage.init();

    if (window.CleanupManager) {
      CleanupManager.registerResource('settingsPage', SettingsPage, (page) => {
        if (page.cleanup) page.cleanup();
      });
    }
  });

  window.SettingsPage = SettingsPage;
  window.syncNotificationSettings = SettingsPage.syncNotificationSettings.bind(SettingsPage);
  window.testUpdateNotification = SettingsPage.testUpdateNotification.bind(SettingsPage);
  window.testLiveUpdateCheck = SettingsPage.testLiveUpdateCheck.bind(SettingsPage);
  window.checkForUpdatesNow = SettingsPage.checkForUpdatesNow.bind(SettingsPage);
  window.showConfirmDialog = SettingsPage.showConfirmDialog.bind(SettingsPage);
  window.hideConfirmDialog = SettingsPage.hideConfirmDialog.bind(SettingsPage);
  window.confirmDisableCoin = SettingsPage.confirmDisableCoin.bind(SettingsPage);

})();
