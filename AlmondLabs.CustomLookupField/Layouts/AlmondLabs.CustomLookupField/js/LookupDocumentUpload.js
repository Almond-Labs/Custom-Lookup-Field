jQuery.ajaxSetup({ async: false });
jQuery.getScript("/_layouts/15/AlmondLabs.CustomLookupField/js/jQuerySP.js");
jQuery.getScript("/_layouts/15/AlmondLabs.CustomLookupField/js/LookupDocumentUploadViewModel.js");
jQuery.ajaxSetup({ async: true });

//Register view callbacks
(function () { 
    var pageModels = new Array();
    var fieldName = "LookupDocumentUpload";

    function View(ctx) {
        pageModels[pageModels.length] = new LookupDocumentUploadModel(ctx, fieldName, "View");
        return pageModels[pageModels.length - 1];
    };
    function Display(ctx) {
        pageModels[pageModels.length] = new LookupDocumentUploadModel(ctx, fieldName, "Display");
        return pageModels[pageModels.length - 1];
    };
    function Edit(ctx) {
        pageModels[pageModels.length] = new LookupDocumentUploadModel(ctx, fieldName, "Edit");
        return pageModels[pageModels.length - 1];
    }

    if (typeof SPClientTemplates === 'undefined')
        return;

    var fieldCtx = {};
    fieldCtx.OnPostRender = function (ctx) {
        for( var x=0; x<pageModels.length; x++ ) {
            pageModels[x].Bind();
        }
    };
    fieldCtx.Templates = {};
    fieldCtx.Templates.Fields = {
        'LookupDocumentUpload': {
            'View': View,
            'DisplayForm': Display,
            'EditForm': Edit,
            'NewForm': Edit
        }
    };

    SPClientTemplates.TemplateManager.RegisterTemplateOverrides(fieldCtx);
})();