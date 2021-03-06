Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',
    items: [
        {
            xtype: 'container',
            itemId: 'exportBtn',
            cls: 'export-button'
        },
        {
            xtype: 'container',
            itemId: 'releaseCombobox',
            cls: 'release-combo-box'
        },
        {
            xtype: 'container',
            itemId: 'gridContainer'
        }
    ],
    launch: function() {
        this._myMask = new Ext.LoadMask(Ext.getBody(), {msg:"Loading data..."});
        this._myMask.show();
        
        this.down('#releaseCombobox').add({
            xtype: 'rallyreleasecombobox',
            itemId: 'stateComboBox',
            allowNoEntry: true,
            noEntryText: 'All Releases',
            value: 'All Releases',
            model: 'TestCase',
            listeners: {
                scope: this,
                select: this._onSelect,
                ready: this._initStore
            },
        });
   },
    _getReleaseFilter: function() {
        return {
            property: 'WorkProductRelease',
            operator: '=',
            value: Number(this.down('#stateComboBox').getRawValue().split(' (')[0].replace(/\D+/g, ''))
        };
    },
    _onSelect: function() {
        var store = this._grid.getStore();

        store.clearFilter(true);
        if (this.down('#stateComboBox').getRawValue() !== "All Releases") {
            store.filter(this._getReleaseFilter());
        } else {
            store.reload();
        }
    },
    _initStore: function() {
        this._userStoryStore = Ext.create('Rally.data.wsapi.Store', {
            model: 'UserStory',
            autoLoad: true,
            remoteSort: false,
            fetch: [
                "FormattedID",
                "Name",
                "ScheduleState",
                "Release",
                "Feature"
            ],
            limit: Infinity
        });
        this._userStoryStore.on('load',function () {
            this._defectsStore = Ext.create('Rally.data.wsapi.Store', {
                model: 'Defect',
                autoLoad: true,
                remoteSort: false,
                fetch:[
                    "FormattedID",
                    "State",
                    "TestCase",
                    "Release"
                ],
                limit: Infinity
            });
            this._defectsStore.on('load',function () {
                Ext.create('Rally.data.wsapi.Store', {
                    model: 'TestCase',
                    autoLoad: true,
                    remoteSort: false,
                    fetch:[
                        "FormattedID", 
                        "Name",
                        "Type",
                        "LastRun",
                        "LastVerdict",
                        "LastBuild",
                        "WorkProduct",
                        "c_Iteration",
                        "Defects"
                    ],
                    limit: Infinity,
                    listeners: {
                        load: this._onDataLoaded,
                        scope:this
                    }
                });
           },this);
        },this);
    },
    _onDataLoaded: function(store, data) {
        _.each(data, function(testcase) {
            if (testcase.data.WorkProduct) {
                testcase.set('WorkProductNumericID', Number(testcase.data.WorkProduct.FormattedID.replace(/\D+/g, '')));
                
                if (testcase.data.WorkProduct.FormattedID.indexOf("US") > -1) {
                    _.each(this._userStoryStore.data.items, function(userStory) {
                        if(userStory.data.FormattedID === testcase.data.WorkProduct.FormattedID) {
                            if (userStory.data.ScheduleState) {
                                testcase.set("WorkProductScheduleState", userStory.get("ScheduleState"));
                            }
                            if (userStory.data.Release) {
                                testcase.set("WorkProductRelease", Number(userStory.get("Release").Name.replace(/\D+/g, '')));
                            }
                            if (userStory.data.Feature) {
                                testcase.data.WorkProductFeatureID= [{
                                    _ref: userStory.get("Feature")._ref, 
                    	            FormattedID: userStory.get("Feature").FormattedID, 
                                }];
                                testcase.set("WorkProductFeatureName", userStory.get("Feature").Name);
                                testcase.set('WorkProductFeatureNumericID', Number(userStory.get("Feature").FormattedID.replace(/\D+/g, '')));
                            }
                        }
                    }, this);
                }
                
                if (testcase.data.WorkProduct.FormattedID.indexOf("DE") > -1) {
                    _.each(this._defectsStore.data.items, function(defect) {
                        if(defect.data.FormattedID === testcase.data.WorkProduct.FormattedID) {
                            if (defect.data.State) {
                                testcase.set("WorkProductScheduleState", defect.get("State"));
                            }
                            if (defect.data.Release && defect.get("Release").Name) {
                                testcase.set("WorkProductRelease", Number(defect.get("Release").Name.replace(/\D+/g, '')));
                            }
                        }
                    }, this);
                }
            }
            if (testcase.data.Defects && testcase.data.Defects.Count > 0) {
                var defectHtml = [];
                _.each(this._defectsStore.data.items, function(defect) {
                    if (defect.data.TestCase && defect.data.TestCase.FormattedID === testcase.data.FormattedID) {
                        defectHtml.push('<a href="' + Rally.nav.Manager.getDetailUrl(defect) + '" target="_blank">' + defect.data.FormattedID + "</a> - " + defect.data.State);
                    }
                }, this);
                testcase.set('OpenDefects', defectHtml.join("</br>"));
            }
        }, this);
        this._makeGrid(data);
    },
    _makeGrid: function(testcases){
        this._myMask.hide();
        var store = Ext.create('Rally.data.custom.Store', {
            data: testcases,
            proxy: {
                type:'memory'
            }
        });
        this._testcases = testcases;
        this._grid = Ext.create('Rally.ui.grid.Grid',{
            itemId: 'testcasesGrid',
            store: store,
            showRowActionsColumn: false,
            showPagingToolbar: false,
            columnCfgs: [
                { 
                    text: "Test Case ID", dataIndex: "FormattedID", xtype: "templatecolumn",
                    tpl: Ext.create("Rally.ui.renderer.template.FormattedIDTemplate"),
                }, {
                    text: "Test Case Name", dataIndex: "Name", flex: 1
                }, {
                    text: "Test Case Type", dataIndex: "Type"
                }, {
                    text: "Work Product ID", dataIndex: "WorkProduct",
                    renderer: function(value) {
                        return value ? '<a href="' + Rally.nav.Manager.getDetailUrl(value) + '" target="_blank">' + value.FormattedID + "</a>" : void 0;
                    },
                    getSortParam: function() {
                        return "WorkProductNumericID";  
                    }
                }, {
                    text: "Work Product State", dataIndex: "WorkProductScheduleState"
                }, {
                    text: "Feature ID", dataIndex: "WorkProductFeatureID",
                    renderer: function(value) {
                        return value ? '<a href="' + Rally.nav.Manager.getDetailUrl(value[0]) + '" target="_blank">' + value[0].FormattedID + "</a>" : void 0;
                    },
                    getSortParam: function() {
                        return "WorkProductFeatureNumericID";  
                    }
                }, {
                    text: "Feature Name", dataIndex: "WorkProductFeatureName"
                }, {
                    text: "Test Case Last Run", dataIndex: "LastRun", xtype: 'datecolumn', format: 'D n/j/Y'
                }, {
                    text: "Test Case Last Build", dataIndex: "LastBuild"
                }, {
                    text: "Test Case Last Verdict", dataIndex: "LastVerdict", sortable: false
                }, {
                    text: "Defects", dataIndex: "OpenDefects"
                }
            ]
        });
        this.down('#gridContainer').add(this._grid);
        this.down('#exportBtn').add({
            xtype: 'rallybutton',
            text: 'Export to CSV',
            href: 'data:text/csv;charset=utf8,' + encodeURIComponent(this._getCSV()),
            id: 'exportButton',
            scope: this
        });
        document.getElementById("exportButton").setAttribute("download","export.csv");
    },
    _getCSV: function () {
        var cols    = this._grid.columns;
        var data = '';
        
        _.each(cols, function(col) {
            data += this._getFieldTextAndEscape(col.text) + ',';
        }, this);
        data += "\r\n";

        _.each(this._testcases, function(record) {
            _.each(cols, function(col) {
                var fieldName = col.dataIndex;
                if (fieldName ==="WorkProduct" && record.data.WorkProduct) {
                    data += this._getFieldTextAndEscape(record.data.WorkProduct.FormattedID) + ',';
                } else if (fieldName ==="WorkProductFeatureID" && record.data.WorkProductFeatureID) {
                     data += this._getFieldTextAndEscape(record.data.WorkProductFeatureID[0].FormattedID) + ',';
                } else if (fieldName ==="LastRun") {
                    var lastRunText = '';
                    if (record.data.LastRun) {
                        lastRunText = record.data.LastRun.toString();
                    }
                    data += this._getFieldTextAndEscape(lastRunText) + ',';
                } else if (fieldName === "OpenDefects" && record.data.OpenDefects) {
                    var text = '\"';
                    _.each(this._defectsStore.data.items, function(defect) {
                        if (defect.data.TestCase && defect.data.TestCase.FormattedID === record.data.FormattedID) {
                            text += defect.data.FormattedID + ' - ' + defect.data.State + '\n';
                        }
                    }, this);
                    text += '\"';
                    data += text + ',';
                } else {
                    data += this._getFieldTextAndEscape(record.get(fieldName)) + ',';
                }
            }, this);
            data += "\r\n";
        }, this);

        return data;
    },
    _getFieldTextAndEscape: function(fieldData) {
        var string  = this._getFieldText(fieldData);  
        return this._escapeForCSV(string);
    },
    _getFieldText: function(fieldData) {
        var text;
        if (fieldData === null || fieldData === undefined || !fieldData.match) {
            text = '';
        } else if (fieldData._refObjectName) {
            text = fieldData._refObjectName;
        }else {
            text = fieldData;
        }
        return text;
    },
    _escapeForCSV: function(string) {
        if (string.match(/,/)) {
            if (!string.match(/"/)) {
                string = '"' + string + '"';
            } else {
                string = string.replace(/,/g, ''); 
            }
        }
        return string;
    }
});